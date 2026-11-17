import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import type { OrgSettings } from "@/db/schema";
import { audit } from "@/lib/audit";
import type { UserContext } from "@/lib/session";

// Every setting has a default here; a missing key in the database means "use the default".
export const SETTING_DEFAULTS = {
  sessionMinutesByRole: { admin: 7 * 24 * 60, manager: 7 * 24 * 60, worker: 7 * 24 * 60, contractor: 24 * 60, client: 30 * 24 * 60 },
  contractorDefaultAccessDays: 90,
  inviteExpiryHours: 72,
  trashRetentionDays: 30,
  auditHotDays: 90,
  archiveClosedProjectsAfterMonths: 12,
  maxUploadMb: 25,
  defaultWebsiteDesignsOffered: 5,
} as const;

export async function getOrg(orgId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  return org;
}

/** Merges a change into the org's settings and records before/after in the audit log. */
export async function saveSettings(ctx: Pick<UserContext, "orgId" | "role" | "user">, area: string, patch: Partial<OrgSettings>) {
  const org = await getOrg(ctx.orgId);
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    const old = (org.settings as Record<string, unknown>)[k];
    if (JSON.stringify(old) !== JSON.stringify(v)) {
      before[k] = old ?? null;
      after[k] = v ?? null;
    }
  }
  if (Object.keys(after).length === 0) return false;
  const next = { ...org.settings, ...patch } as OrgSettings;
  for (const k of Object.keys(next) as (keyof OrgSettings)[]) if (next[k] === undefined) delete next[k];
  await db.update(organizations).set({ settings: next }).where(eq(organizations.id, ctx.orgId));
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: `settings.${area}`, entityType: "organization", entityId: ctx.orgId, changes: { before, after } });
  return true;
}

/** Whole number in a range, or undefined for "use the default". */
export function intIn(v: FormDataEntryValue | null | undefined, min: number, max: number) {
  const s = String(v ?? "").trim();
  if (s === "") return undefined;
  const n = Math.round(Number(s));
  if (!Number.isFinite(n) || n < min || n > max) throw new SettingsError(`Use a number from ${min} to ${max}.`);
  return n;
}

export class SettingsError extends Error {}
