"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { automationRules, businessHours, holidays, organizations, rolePermissions } from "@/db/schema";
import { audit } from "@/lib/audit";
import { intIn, saveSettings, SettingsError } from "@/lib/org-settings";
import { DEFAULT_PERMISSIONS, LOCKED, type Permission, type Role } from "@/lib/permissions";
import { requirePermission } from "@/lib/session";

export type FormState = { ok?: string; error?: string; at?: number };
const done = (ok: string): FormState => ({ ok, at: Date.now() });
const fail = (error: string): FormState => ({ error, at: Date.now() });
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const on = (v: FormDataEntryValue | null) => v !== null && v !== "false" && v !== "off" && v !== "";

async function guard(fn: () => Promise<FormState>): Promise<FormState> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof SettingsError) return fail(err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

export async function saveOrganization(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requirePermission("settings.manage");
  const name = str(form.get("name"));
  const timezone = str(form.get("timezone"));
  if (!name) return fail("Enter the business name.");
  if (!Intl.supportedValuesOf("timeZone").includes(timezone)) return fail("Choose a time zone.");
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  if (org.name === name && org.timezone === timezone) return done("No changes.");
  await db.update(organizations).set({ name, timezone }).where(eq(organizations.id, ctx.orgId));
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "settings.organization", entityType: "organization", entityId: ctx.orgId, changes: { before: { name: org.name, timezone: org.timezone }, after: { name, timezone } } });
  revalidatePath("/", "layout");
  return done("Saved.");
}

// ---------------------------------------------------------------------------
// Business hours and holidays
// ---------------------------------------------------------------------------

export async function saveHours(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requirePermission("settings.manage");
  const rows: { dayOfWeek: number; opensAt: string; closesAt: string }[] = [];
  for (let d = 0; d < 7; d++) {
    if (!on(form.get(`open-${d}`))) continue;
    const opensAt = str(form.get(`opens-${d}`));
    const closesAt = str(form.get(`closes-${d}`));
    if (!/^\d{2}:\d{2}$/.test(opensAt) || !/^\d{2}:\d{2}$/.test(closesAt) || opensAt >= closesAt) return fail("Each open day needs an opening time before its closing time.");
    rows.push({ dayOfWeek: d, opensAt, closesAt });
  }
  const before = await db.select().from(businessHours).where(eq(businessHours.orgId, ctx.orgId));
  await db.transaction(async (tx) => {
    await tx.delete(businessHours).where(eq(businessHours.orgId, ctx.orgId));
    if (rows.length) await tx.insert(businessHours).values(rows.map((r) => ({ orgId: ctx.orgId, ...r })));
  });
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    action: "settings.business_hours",
    entityType: "organization",
    entityId: ctx.orgId,
    changes: { before: { hours: before.map((b) => `${b.dayOfWeek} ${b.opensAt}-${b.closesAt}`) }, after: { hours: rows.map((b) => `${b.dayOfWeek} ${b.opensAt}-${b.closesAt}`) } },
  });
  revalidatePath("/settings/hours");
  return done(rows.length ? "Business hours saved." : "Saved. With no open days, response targets count every hour.");
}

export async function addHoliday(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requirePermission("settings.manage");
  const date = str(form.get("date"));
  const name = str(form.get("name"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Pick a date.");
  if (!name) return fail("Name the holiday.");
  const [row] = await db.insert(holidays).values({ orgId: ctx.orgId, date, name }).onConflictDoNothing().returning();
  if (!row) return fail("There's already a holiday on that date.");
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "settings.holiday_add", entityType: "organization", entityId: ctx.orgId, metadata: { date, name } });
  revalidatePath("/settings/hours");
  return done(`${name} added.`);
}

export async function removeHoliday(id: string): Promise<FormState> {
  const ctx = await requirePermission("settings.manage");
  const [h] = await db.delete(holidays).where(and(eq(holidays.id, id), eq(holidays.orgId, ctx.orgId))).returning();
  if (h) await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "settings.holiday_remove", entityType: "organization", entityId: ctx.orgId, metadata: { date: h.date, name: h.name } });
  revalidatePath("/settings/hours");
  return done("Removed.");
}

// ---------------------------------------------------------------------------
// Users & access
// ---------------------------------------------------------------------------

export async function saveAccess(_: FormState, form: FormData): Promise<FormState> {
  return guard(async () => {
    const ctx = await requirePermission("settings.manage");
    const domains = [...new Set(str(form.get("domains")).toLowerCase().split(/[\s,]+/).map((d) => d.replace(/^@/, "")).filter(Boolean))];
    if (domains.some((d) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d))) return fail("Domains look like fountlinedigital.com.");
    if (domains.length === 0) return fail("Keep at least one team domain, or nobody on the team can sign in with Google.");
    const roles: Role[] = ["admin", "manager", "worker", "contractor", "client"];
    const sessionMinutesByRole: Partial<Record<Role, number>> = {};
    for (const r of roles) {
      const hours = intIn(form.get(`session-${r}`), 1, 24 * 90);
      if (hours !== undefined) sessionMinutesByRole[r] = hours * 60;
    }
    await saveSettings(ctx, "access", {
      allowedGoogleDomains: domains,
      sessionMinutesByRole,
      contractorDefaultAccessDays: intIn(form.get("contractorDays"), 1, 730),
      inviteExpiryHours: intIn(form.get("inviteHours"), 1, 24 * 30),
    });
    revalidatePath("/settings/access");
    return done("Access settings saved. New session lengths apply from each person's next sign-in check.");
  });
}

/** One permission for one role. Locked (security) permissions can't be changed. */
export async function setRolePermission(role: Role, permission: Permission, allowed: boolean): Promise<FormState> {
  const ctx = await requirePermission("settings.manage");
  if (!(permission in DEFAULT_PERMISSIONS) || LOCKED.includes(permission) || role === "client" || role === "admin") return fail("That permission can't be changed.");
  const byDefault = (DEFAULT_PERMISSIONS[permission] as readonly Role[]).includes(role);
  if (allowed === byDefault) {
    await db.delete(rolePermissions).where(and(eq(rolePermissions.orgId, ctx.orgId), eq(rolePermissions.role, role), eq(rolePermissions.permission, permission)));
  } else {
    await db
      .insert(rolePermissions)
      .values({ orgId: ctx.orgId, role, permission, allowed })
      .onConflictDoUpdate({ target: [rolePermissions.orgId, rolePermissions.role, rolePermissions.permission], set: { allowed } });
  }
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "settings.permission", entityType: "organization", entityId: ctx.orgId, changes: { before: { [`${role}:${permission}`]: !allowed }, after: { [`${role}:${permission}`]: allowed } } });
  revalidatePath("/", "layout");
  return done("Saved.");
}

// ---------------------------------------------------------------------------
// Client portal
// ---------------------------------------------------------------------------

export async function savePortal(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requirePermission("settings.manage");
  const supportEmail = str(form.get("supportEmail"));
  if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) return fail("Check the support email.");
  const opt = (k: string, max: number) => str(form.get(k)).slice(0, max) || undefined;
  await saveSettings(ctx, "portal", {
    portal: {
      showDueDates: on(form.get("showDueDates")),
      showAssigneeNames: on(form.get("showAssigneeNames")),
      welcomeMessage: opt("welcomeMessage", 500),
      bannerMessage: opt("bannerMessage", 300),
      supportEmail: supportEmail || undefined,
      supportPhone: opt("supportPhone", 40),
      approvalWording: opt("approvalWording", 500),
    },
  });
  revalidatePath("/portal", "layout");
  revalidatePath("/settings/portal");
  return done("Portal settings saved.");
}

// ---------------------------------------------------------------------------
// Automation
// ---------------------------------------------------------------------------

const KINDS = ["approval_reminder", "auto_close_waiting", "escalate_overdue"] as const;

export async function saveAutomation(_: FormState, form: FormData): Promise<FormState> {
  return guard(async () => {
    const ctx = await requirePermission("settings.manage");
    const before = await db.select().from(automationRules).where(eq(automationRules.orgId, ctx.orgId));
    for (const kind of KINDS) {
      const afterDays = intIn(form.get(`${kind}-days`), 0, 365) ?? before.find((b) => b.kind === kind)?.afterDays ?? 3;
      const isActive = on(form.get(`${kind}-active`));
      await db
        .insert(automationRules)
        .values({ orgId: ctx.orgId, kind, afterDays, isActive })
        .onConflictDoUpdate({ target: [automationRules.orgId, automationRules.kind], set: { afterDays, isActive } });
    }
    const after = await db.select().from(automationRules).where(eq(automationRules.orgId, ctx.orgId));
    const view = (rows: typeof after) => Object.fromEntries(rows.map((r) => [r.kind, r.isActive ? `${r.afterDays} days` : "off"]));
    await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "settings.automation", entityType: "organization", entityId: ctx.orgId, changes: { before: view(before), after: view(after) } });
    revalidatePath("/settings/automation");
    return done("Automation saved. It applies from the next scheduled run.");
  });
}

// ---------------------------------------------------------------------------
// Files & data
// ---------------------------------------------------------------------------

export async function saveFilesData(_: FormState, form: FormData): Promise<FormState> {
  return guard(async () => {
    const ctx = await requirePermission("settings.manage");
    const types = [...new Set(str(form.get("fileTypes")).toLowerCase().split(/[\s,]+/).map((t) => t.replace(/^\./, "")).filter(Boolean))];
    if (types.some((t) => !/^[a-z0-9]{1,10}$/.test(t))) return fail("File types look like pdf, png, docx.");
    const blocked = types.filter((t) => ["exe", "bat", "cmd", "sh", "js", "html", "htm", "msi", "dll", "scr", "ps1", "vbs", "jar"].includes(t));
    if (blocked.length) return fail(`For safety, these can't be allowed: ${blocked.join(", ")}.`);
    await saveSettings(ctx, "files_data", {
      maxUploadMb: intIn(form.get("maxUploadMb"), 1, 500),
      allowedFileTypes: types.length ? types : undefined,
      trashRetentionDays: intIn(form.get("trashDays"), 1, 365),
      auditHotDays: intIn(form.get("auditDays"), 31, 3650),
      archiveClosedProjectsAfterMonths: intIn(form.get("archiveMonths"), 1, 120),
    });
    revalidatePath("/settings/data");
    return done("Saved.");
  });
}
