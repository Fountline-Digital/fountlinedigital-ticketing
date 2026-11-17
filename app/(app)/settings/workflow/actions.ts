"use server";
import { revalidatePath } from "next/cache";
import { and, asc, count, eq, max, ne } from "drizzle-orm";
import { db } from "@/db";
import { leadStages, lostReasons, phaseNames, priorities, serviceLines, ticketStatuses, ticketTypes, tickets, tiers } from "@/db/schema";
import { audit } from "@/lib/audit";
import { LISTS, STAGE_KINDS, STATUS_CATEGORIES, TYPE_KINDS, type ListKey } from "@/lib/lookups";
import { requirePermission } from "@/lib/session";

export type Result = { ok?: string; error?: string };

// All share id / orgId / name / sortOrder / isActive; this one shape covers them for these queries.
const TABLES = { statuses: ticketStatuses, types: ticketTypes, priorities, stages: leadStages, lostReasons, phaseNames, serviceLines, tiers } as const;
const tableOf = (list: ListKey) => TABLES[list] as unknown as typeof ticketStatuses;
type Row = Record<string, unknown> & { id: string; name: string; isActive: boolean; sortOrder: number };

const HEX = /^#[0-9a-f]{6}$/i;
const refresh = () => revalidatePath("/", "layout");

async function rows(orgId: string, list: ListKey) {
  const t = tableOf(list);
  return (await db.select().from(t).where(eq(t.orgId, orgId)).orderBy(asc(t.sortOrder))) as unknown as Row[];
}

/**
 * What the app needs to keep working: at least one active To do and Done status,
 * an active type of each kind the app creates, and an Open, Won and Lost lead stage.
 */
function missingEssentials(list: ListKey, active: Row[]) {
  const has = (key: string, value: string) => active.some((r) => r[key] === value);
  if (list === "statuses") for (const c of ["todo", "done", "cancelled"]) if (!has("category", c)) return `Keep at least one active status in the ${STATUS_CATEGORIES.find((x) => x.value === c)?.label} category.`;
  if (list === "types") for (const k of ["project_task", "support", "change_request", "lead"]) if (!has("kind", k)) return `Keep at least one active ${TYPE_KINDS.find((x) => x.value === k)?.label} type.`;
  if (list === "stages") for (const k of ["open", "won", "lost"]) if (!has("kind", k)) return `Keep at least one active ${STAGE_KINDS.find((x) => x.value === k)?.label} stage.`;
  if (list === "priorities" && active.length === 0) return "Keep at least one priority.";
  return null;
}

function clean(list: ListKey, input: Record<string, unknown>, creating: boolean): Record<string, unknown> | string {
  const out: Record<string, unknown> = {};
  for (const f of LISTS[list].fields) {
    if ("createOnly" in f && f.createOnly && !creating) continue;
    const v = input[f.key];
    if (f.kind === "bool") out[f.key] = Boolean(v);
    else if (f.kind === "color") {
      if (typeof v !== "string" || !HEX.test(v)) return "Pick a color.";
      out[f.key] = v;
    } else if (f.kind === "select") {
      if (!f.options.some((o) => o.value === v)) return `Choose a ${f.label.toLowerCase()}.`;
      out[f.key] = v;
    } else if (f.kind === "code") {
      const code = String(v ?? "").trim().toUpperCase();
      if (!/^[A-Z0-9]{2,8}$/.test(code)) return "The code must be 2-8 capital letters or numbers.";
      out[f.key] = code;
    } else {
      const s = String(v ?? "").trim().slice(0, 60);
      if (!s) return `${f.label} can't be empty.`;
      out[f.key] = s;
    }
  }
  return out;
}

export async function saveLookup(list: ListKey, id: string | null, input: Record<string, unknown>): Promise<Result> {
  const ctx = await requirePermission("settings.manage");
  if (!(list in LISTS)) return { error: "Unknown list." };
  const t = tableOf(list);
  const values = clean(list, input, !id);
  if (typeof values === "string") return { error: values };
  const all = await rows(ctx.orgId, list);
  if (all.some((r) => r.id !== id && String(r.name).toLowerCase() === String(values.name).toLowerCase())) return { error: `There's already one called ${values.name}.` };
  if (values.code && all.some((r) => r.code === values.code)) return { error: `The code ${values.code} is already used.` };

  if (id) {
    const before = all.find((r) => r.id === id);
    if (!before) return { error: "Not found." };
    const after = all.map((r) => (r.id === id ? { ...r, ...values } : r));
    const problem = missingEssentials(list, after.filter((r) => r.isActive));
    if (problem) return { error: problem };
    await db.update(t).set(values).where(and(eq(t.id, id), eq(t.orgId, ctx.orgId)));
    const changes = Object.fromEntries(Object.keys(values).filter((k) => before[k] !== values[k]).map((k) => [k, before[k]]));
    await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: `settings.${list}_update`, entityType: list, entityId: id, changes: { before: changes, after: values } });
    refresh();
    return { ok: "Saved." };
  }
  const [m] = await db.select({ n: max(t.sortOrder) }).from(t).where(eq(t.orgId, ctx.orgId));
  const [row] = await db.insert(t).values({ orgId: ctx.orgId, sortOrder: (m?.n ?? -1) + 1, ...values } as typeof t.$inferInsert).returning();
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: `settings.${list}_create`, entityType: list, entityId: row.id, changes: { after: values } });
  refresh();
  return { ok: `${values.name} added.` };
}

export async function moveLookup(list: ListKey, id: string, dir: -1 | 1): Promise<Result> {
  const ctx = await requirePermission("settings.manage");
  const t = tableOf(list);
  const all = await rows(ctx.orgId, list);
  const i = all.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return {};
  const order = [...all];
  [order[i], order[j]] = [order[j], order[i]];
  for (const [n, r] of order.entries()) if (r.sortOrder !== n) await db.update(t).set({ sortOrder: n }).where(eq(t.id, r.id));
  refresh();
  return {};
}

/** Retire hides it from new choices; tickets already using it keep it. */
export async function setLookupActive(list: ListKey, id: string, active: boolean): Promise<Result> {
  const ctx = await requirePermission("settings.manage");
  const t = tableOf(list);
  const all = await rows(ctx.orgId, list);
  const row = all.find((r) => r.id === id);
  if (!row) return { error: "Not found." };
  if (!active) {
    if (row.isDefault) return { error: "Make another one the default first." };
    const problem = missingEssentials(list, all.filter((r) => r.isActive && r.id !== id));
    if (problem) return { error: problem };
  }
  await db.update(t).set({ isActive: active }).where(eq(t.id, id));
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: `settings.${list}_${active ? "restore" : "retire"}`, entityType: list, entityId: id, metadata: { name: row.name } });
  refresh();
  return { ok: active ? `${row.name} is back.` : `${row.name} retired. Anything already using it keeps it.` };
}

export async function setLookupDefault(list: "statuses" | "priorities", id: string): Promise<Result> {
  const ctx = await requirePermission("settings.manage");
  const t = list === "statuses" ? ticketStatuses : priorities;
  const [row] = await db.select().from(t).where(and(eq(t.id, id), eq(t.orgId, ctx.orgId)));
  if (!row) return { error: "Not found." };
  if (!row.isActive) return { error: "Restore it first." };
  if (list === "statuses" && "category" in row && !["new", "todo"].includes(row.category as string)) return { error: "The default status for new tickets should be a New or To do status." };
  await db.update(t).set({ isDefault: false }).where(and(eq(t.orgId, ctx.orgId), ne(t.id, id)));
  await db.update(t).set({ isDefault: true }).where(eq(t.id, id));
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: `settings.${list}_default`, entityType: list, entityId: id, metadata: { name: row.name } });
  refresh();
  return { ok: `${row.name} is now the default.` };
}

/** Only things nothing uses can be deleted; everything else is retired instead. */
export async function deleteLookup(list: ListKey, id: string): Promise<Result> {
  const ctx = await requirePermission("settings.manage");
  const t = tableOf(list);
  const all = await rows(ctx.orgId, list);
  const row = all.find((r) => r.id === id);
  if (!row) return { error: "Not found." };
  if (row.isDefault) return { error: "Make another one the default first." };
  const problem = missingEssentials(list, all.filter((r) => r.isActive && r.id !== id));
  if (problem) return { error: problem };
  // Leads point at stages/reasons with "set null", so check those by hand (others are blocked by the database)
  if (list === "stages" || list === "lostReasons") {
    const col = list === "stages" ? tickets.leadStageId : tickets.lostReasonId;
    const [used] = await db.select({ n: count() }).from(tickets).where(eq(col, id));
    if ((used?.n ?? 0) > 0) return { error: `${row.name} is used by ${used.n} lead${used.n === 1 ? "" : "s"}, so it can't be deleted. Retire it instead.` };
  }
  try {
    await db.delete(t).where(eq(t.id, id));
  } catch (err) {
    const code = (err as { code?: string; cause?: { code?: string } }).code ?? (err as { cause?: { code?: string } }).cause?.code;
    if (code === "23503") return { error: `${row.name} is in use, so it can't be deleted. Retire it instead.` };
    throw err;
  }
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: `settings.${list}_delete`, entityType: list, entityId: id, metadata: { name: row.name } });
  refresh();
  return { ok: `${row.name} deleted.` };
}
