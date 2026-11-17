"use server";
import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, max } from "drizzle-orm";
import { db } from "@/db";
import { assignmentRules, contactFormRules, memberships, priorities, requestForms, serviceLines, ticketTypes } from "@/db/schema";
import { audit } from "@/lib/audit";
import { saveSettings } from "@/lib/org-settings";
import { requirePermission } from "@/lib/session";

export type Result = { ok?: string; error?: string };
const PATH = "/settings/intake";

// The three rule tables share id / orgId / name / sortOrder / isActive.
const TABLES = { contact: contactFormRules, forms: requestForms, assign: assignmentRules } as const;
export type RuleTable = keyof typeof TABLES;
const tableOf = (k: RuleTable) => TABLES[k] as unknown as typeof contactFormRules;

async function ctxOf() {
  return requirePermission("settings.manage");
}
const log = (ctx: Awaited<ReturnType<typeof ctxOf>>, action: string, entityId: string, changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> }) =>
  audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: `settings.${action}`, entityType: action.split("_")[0], entityId, changes });

async function typeIn(orgId: string, id: string | null) {
  if (!id) return null;
  const [t] = await db.select().from(ticketTypes).where(and(eq(ticketTypes.id, id), eq(ticketTypes.orgId, orgId)));
  return t ?? null;
}
async function nextOrder(k: RuleTable, orgId: string) {
  const t = tableOf(k);
  const [m] = await db.select({ n: max(t.sortOrder) }).from(t).where(eq(t.orgId, orgId));
  return (m?.n ?? -1) + 1;
}
async function membersIn(orgId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db.select({ id: memberships.id, orgId: memberships.orgId, role: memberships.role }).from(memberships).where(inArray(memberships.id, ids));
  return rows.filter((m) => m.orgId === orgId && m.role !== "client").map((m) => m.id);
}

// ---------------------------------------------------------------------------
// Shared: order, on/off, delete
// ---------------------------------------------------------------------------

export async function moveRule(k: RuleTable, id: string, dir: -1 | 1): Promise<Result> {
  const ctx = await ctxOf();
  const t = tableOf(k);
  const all = await db.select().from(t).where(eq(t.orgId, ctx.orgId)).orderBy(asc(t.sortOrder));
  const i = all.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return {};
  [all[i], all[j]] = [all[j], all[i]];
  for (const [n, r] of all.entries()) if (r.sortOrder !== n) await db.update(t).set({ sortOrder: n }).where(eq(t.id, r.id));
  revalidatePath(PATH);
  return {};
}

export async function setRuleActive(k: RuleTable, id: string, active: boolean): Promise<Result> {
  const ctx = await ctxOf();
  const t = tableOf(k);
  const [row] = await db.update(t).set({ isActive: active }).where(and(eq(t.id, id), eq(t.orgId, ctx.orgId))).returning();
  if (!row) return { error: "Not found." };
  await log(ctx, `${k}_${active ? "on" : "off"}`, id, { after: { name: row.name, isActive: active } });
  revalidatePath(PATH);
  return { ok: active ? `${row.name} turned on.` : `${row.name} turned off.` };
}

export async function deleteRule(k: RuleTable, id: string): Promise<Result> {
  const ctx = await ctxOf();
  const t = tableOf(k);
  const [row] = await db.delete(t).where(and(eq(t.id, id), eq(t.orgId, ctx.orgId))).returning();
  if (!row) return { error: "Not found." };
  await log(ctx, `${k}_delete`, id, { before: { name: row.name } });
  revalidatePath(PATH);
  return { ok: `${row.name} deleted.` };
}

// ---------------------------------------------------------------------------
// Contact form rules
// ---------------------------------------------------------------------------

export type ContactRuleInput = {
  name: string;
  conditions: { key: string; values: string[] }[];
  ticketTypeId: string;
  priorityId: string;
  assigneeMembershipId: string; // "" = Sales team / default-assignee rules
  titleTemplate: string;
  checklist: string[];
};

export async function saveContactRule(id: string | null, input: ContactRuleInput): Promise<Result> {
  const ctx = await ctxOf();
  const name = input.name.trim().slice(0, 80);
  if (!name) return { error: "Name the rule." };
  const type = await typeIn(ctx.orgId, input.ticketTypeId);
  if (!type) return { error: "Choose the ticket type." };
  const [prio] = await db.select().from(priorities).where(and(eq(priorities.id, input.priorityId), eq(priorities.orgId, ctx.orgId)));
  if (!prio) return { error: "Choose a priority." };
  const assignee = input.assigneeMembershipId ? (await membersIn(ctx.orgId, [input.assigneeMembershipId]))[0] : null;
  if (input.assigneeMembershipId && !assignee) return { error: "That person isn't on the team." };
  const conditions: Record<string, string[]> = {};
  for (const c of input.conditions) {
    const key = c.key.trim().toLowerCase().slice(0, 40);
    const values = [...new Set(c.values.map((v) => v.trim()).filter(Boolean))].slice(0, 30);
    if (key && values.length) conditions[key] = values;
  }
  const values = {
    name,
    conditions,
    ticketTypeId: type.id,
    priorityId: prio.id,
    assigneeMembershipId: assignee,
    titleTemplate: input.titleTemplate.trim().slice(0, 200) || "New inquiry: {name}",
    checklist: input.checklist.map((x) => x.trim()).filter(Boolean).slice(0, 20),
  };
  if (id) {
    const [row] = await db.update(contactFormRules).set(values).where(and(eq(contactFormRules.id, id), eq(contactFormRules.orgId, ctx.orgId))).returning();
    if (!row) return { error: "Not found." };
    await log(ctx, "contact_update", id, { after: values });
  } else {
    const [row] = await db.insert(contactFormRules).values({ orgId: ctx.orgId, sortOrder: await nextOrder("contact", ctx.orgId), ...values }).returning();
    await log(ctx, "contact_create", row.id, { after: values });
  }
  revalidatePath(PATH);
  return { ok: "Rule saved." };
}

// ---------------------------------------------------------------------------
// Portal request forms
// ---------------------------------------------------------------------------

export type FormFieldInput = { key: string; label: string; kind: "short_text" | "long_text" | "select" | "multi_select" | "file" | "url" | "date"; options: string[]; required: boolean };
const FIELD_KINDS = ["short_text", "long_text", "select", "multi_select", "file", "url", "date"];

export async function saveRequestForm(id: string | null, input: { name: string; ticketTypeId: string; fields: FormFieldInput[] }): Promise<Result> {
  const ctx = await ctxOf();
  const name = input.name.trim().slice(0, 80);
  if (!name) return { error: "Name the form." };
  const type = await typeIn(ctx.orgId, input.ticketTypeId);
  if (!type || !["support", "change_request"].includes(type.kind)) return { error: "Choose a Support or Change request ticket type." };
  if (input.fields.length === 0) return { error: "Add at least one field." };
  if (!input.fields.some((f) => f.kind === "short_text")) return { error: "Add at least one short answer field; the first one becomes the request's title." };
  const used = new Set<string>();
  const fields = [];
  for (const [i, f] of input.fields.entries()) {
    const label = f.label.trim().slice(0, 200);
    if (!label) return { error: `Field ${i + 1} needs a label.` };
    if (!FIELD_KINDS.includes(f.kind)) return { error: `Field ${i + 1} has an unknown type.` };
    const options = [...new Set(f.options.map((o) => o.trim()).filter(Boolean))].slice(0, 30);
    if ((f.kind === "select" || f.kind === "multi_select") && options.length < 2) return { error: `Field ${i + 1} needs at least two options.` };
    // Keys stay stable once saved (answers are stored under them); new fields get one from the label
    let key = (f.key || label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30)) || `field_${i + 1}`;
    while (used.has(key)) key = `${key}_${i + 1}`;
    used.add(key);
    fields.push({ key, label, kind: f.kind, ...(options.length && (f.kind === "select" || f.kind === "multi_select") ? { options } : {}), ...(f.required ? { required: true } : {}) });
  }
  const values = { name, ticketTypeId: type.id, fields };
  if (id) {
    const [row] = await db.update(requestForms).set(values).where(and(eq(requestForms.id, id), eq(requestForms.orgId, ctx.orgId))).returning();
    if (!row) return { error: "Not found." };
    await log(ctx, "forms_update", id, { after: { name, fields: fields.length } });
  } else {
    const [row] = await db.insert(requestForms).values({ orgId: ctx.orgId, sortOrder: await nextOrder("forms", ctx.orgId), ...values }).returning();
    await log(ctx, "forms_create", row.id, { after: { name, fields: fields.length } });
  }
  revalidatePath(PATH);
  revalidatePath("/portal/requests/new");
  return { ok: "Form saved. Clients see it right away." };
}

// ---------------------------------------------------------------------------
// Default assignees
// ---------------------------------------------------------------------------

export type AssignInput = { name: string; serviceLineId: string; ticketTypeId: string; strategy: "fixed" | "round_robin"; assigneeMembershipId: string; poolMembershipIds: string[] };

export async function saveAssignmentRule(id: string | null, input: AssignInput): Promise<Result> {
  const ctx = await ctxOf();
  const name = input.name.trim().slice(0, 80);
  if (!name) return { error: "Name the rule." };
  if (!input.serviceLineId && !input.ticketTypeId) return { error: "Choose a service line, a ticket type, or both." };
  const [line] = input.serviceLineId ? await db.select().from(serviceLines).where(and(eq(serviceLines.id, input.serviceLineId), eq(serviceLines.orgId, ctx.orgId))) : [];
  if (input.serviceLineId && !line) return { error: "Unknown service line." };
  const type = await typeIn(ctx.orgId, input.ticketTypeId || null);
  if (input.ticketTypeId && !type) return { error: "Unknown ticket type." };
  const fixed = input.strategy === "fixed";
  const assignee = fixed ? (await membersIn(ctx.orgId, [input.assigneeMembershipId]))[0] : null;
  if (fixed && !assignee) return { error: "Choose who gets them." };
  const pool = fixed ? [] : await membersIn(ctx.orgId, [...new Set(input.poolMembershipIds)]);
  if (!fixed && pool.length < 2) return { error: "Pick at least two people to take turns." };
  const values = { name, serviceLineId: line?.id ?? null, ticketTypeId: type?.id ?? null, strategy: input.strategy, assigneeMembershipId: assignee, poolMembershipIds: pool, lastAssignedIndex: 0 };
  if (id) {
    const [row] = await db.update(assignmentRules).set(values).where(and(eq(assignmentRules.id, id), eq(assignmentRules.orgId, ctx.orgId))).returning();
    if (!row) return { error: "Not found." };
    await log(ctx, "assign_update", id, { after: { name, strategy: input.strategy, people: fixed ? 1 : pool.length } });
  } else {
    const [row] = await db.insert(assignmentRules).values({ orgId: ctx.orgId, sortOrder: await nextOrder("assign", ctx.orgId), ...values }).returning();
    await log(ctx, "assign_create", row.id, { after: { name, strategy: input.strategy, people: fixed ? 1 : pool.length } });
  }
  revalidatePath(PATH);
  return { ok: "Saved." };
}

// ---------------------------------------------------------------------------
// Spam protection
// ---------------------------------------------------------------------------

export async function saveSpam(perHour: number): Promise<Result> {
  const ctx = await ctxOf();
  const n = Math.round(perHour);
  if (!Number.isFinite(n) || n < 1 || n > 100) return { error: "Use a number from 1 to 100." };
  await saveSettings(ctx, "intake", { intake: { rateLimitPerHour: n } });
  revalidatePath(PATH);
  return { ok: "Saved." };
}
