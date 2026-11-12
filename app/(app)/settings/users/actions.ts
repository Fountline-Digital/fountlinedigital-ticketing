"use server";
import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { invites, memberships, organizations, sessions, userMfa } from "@/db/schema";
import { audit } from "@/lib/audit";
import { createInvite as createInviteRecord, sendInviteEmail } from "@/lib/invites";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { requirePermission, type UserContext } from "@/lib/session";

export type InviteState = { error?: string; ok?: string; at?: number };

const PATH = "/settings/users";
const ROLES: Role[] = ["admin", "manager", "worker", "contractor", "client"];

export type ActionResult = { ok?: string; error?: string };

class ActionError extends Error {}
function fail(message: string): never {
  throw new ActionError(message);
}

// Runs a row action and turns expected problems into a message for the toast.
async function run(fn: () => Promise<string>): Promise<ActionResult> {
  try {
    return { ok: await fn() };
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message };
    throw err;
  }
}

const checked = (v: FormDataEntryValue | null) => v !== null && v !== "false" && v !== "off" && v !== "";

async function orgSettings(orgId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  return org;
}

// Loads a membership only if it belongs to the acting user's org.
async function membershipInOrg(ctx: UserContext, membershipId: string) {
  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.id, membershipId), eq(memberships.orgId, ctx.orgId)));
  if (!m) fail("User not found in this organization.");
  return m;
}

async function activeAdminCount(orgId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.role, "admin"), eq(memberships.status, "active")));
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------

export async function createInvite(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const ctx = await requirePermission("users.invite");
  const role = String(formData.get("role") ?? "") as Role;
  const result = await createInviteRecord(ctx, {
    email: String(formData.get("email") ?? ""),
    role,
    clientId: String(formData.get("clientId") ?? "") || null,
    accessEnds: String(formData.get("accessEnds") ?? "") || null,
    contact:
      role === "client"
        ? {
            name: String(formData.get("contactName") ?? "").trim(),
            isPrimary: checked(formData.get("isPrimary")),
            isApprover: checked(formData.get("isApprover")),
            isBilling: checked(formData.get("isBilling")),
          }
        : undefined,
  });
  revalidatePath(PATH);
  // Validation problems show in the form; saved-but-not-emailed shows as a toast.
  if (result.error && !result.error.startsWith("Invite saved")) return { error: result.error };
  return { ...result, at: Date.now() };
}

export async function resendInvite(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission("users.invite");
  return run(async () => {
    const id = String(formData.get("inviteId"));
    const [invite] = await db.select().from(invites).where(and(eq(invites.id, id), eq(invites.orgId, ctx.orgId)));
    if (!invite || invite.acceptedAt || invite.revokedAt) fail("That invite is no longer open.");

    const org = await orgSettings(ctx.orgId);
    await db
      .update(invites)
      .set({ expiresAt: new Date(Date.now() + (org.settings.inviteExpiryHours ?? 72) * 3_600_000) })
      .where(eq(invites.id, id));
    try {
      await sendInviteEmail(ctx, id);
    } catch (err) {
      console.error(err);
      fail("The email didn't send. Try again in a minute.");
    }
    await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "invite.resend", entityType: "invite", entityId: id });
    revalidatePath(PATH);
    return `Invite resent to ${invite.email}.`;
  });
}

export async function revokeInvite(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission("users.invite");
  return run(async () => {
    const id = String(formData.get("inviteId"));
    await db.update(invites).set({ revokedAt: new Date() }).where(and(eq(invites.id, id), eq(invites.orgId, ctx.orgId)));
    await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "invite.revoke", entityType: "invite", entityId: id });
    revalidatePath(PATH);
    return "Invite revoked.";
  });
}

export async function changeRole(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission("users.manage");
  return run(async () => {
    const m = await membershipInOrg(ctx, String(formData.get("membershipId")));
    const role = String(formData.get("role")) as Role;
    if (!ROLES.includes(role)) fail("Choose a role.");
    if (role === m.role) return "No change.";
    if (role === "client") fail("Client access is set by inviting someone to a client.");
    if (m.role === "admin" && (await activeAdminCount(ctx.orgId)) <= 1) fail("There must be at least one admin.");

    await db
      .update(memberships)
      .set({ role, clientId: null, accessExpiresAt: role === "contractor" ? m.accessExpiresAt : null })
      .where(eq(memberships.id, m.id));
    await audit({
      orgId: ctx.orgId,
      actorUserId: ctx.user.id,
      actorRole: ctx.role,
      action: "membership.role_change",
      entityType: "membership",
      entityId: m.id,
      changes: { before: { role: m.role }, after: { role } },
    });
    revalidatePath(PATH);
    return `Role changed to ${ROLE_LABELS[role]}.`;
  });
}

export async function setAccessEnds(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission("users.manage");
  return run(async () => {
    const m = await membershipInOrg(ctx, String(formData.get("membershipId")));
    const value = String(formData.get("accessEnds") ?? "");
    const accessExpiresAt = value ? new Date(`${value}T23:59:59`) : null;
    await db.update(memberships).set({ accessExpiresAt }).where(eq(memberships.id, m.id));
    await audit({
      orgId: ctx.orgId,
      actorUserId: ctx.user.id,
      actorRole: ctx.role,
      action: "membership.access_ends_change",
      entityType: "membership",
      entityId: m.id,
      changes: { before: { accessExpiresAt: m.accessExpiresAt }, after: { accessExpiresAt } },
    });
    revalidatePath(PATH);
    return value ? "Access end date updated." : "Access end date removed.";
  });
}

export async function setActive(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission("users.manage");
  return run(async () => {
    const m = await membershipInOrg(ctx, String(formData.get("membershipId")));
    const activate = formData.get("activate") === "true";
    if (m.userId === ctx.user.id) fail("You can't deactivate yourself.");
    if (!activate && m.role === "admin" && (await activeAdminCount(ctx.orgId)) <= 1) fail("There must be at least one admin.");

    const status = activate ? "active" : "suspended";
    await db.update(memberships).set({ status }).where(eq(memberships.id, m.id));
    if (!activate) await db.delete(sessions).where(eq(sessions.userId, m.userId)); // signed out right away
    await audit({
      orgId: ctx.orgId,
      actorUserId: ctx.user.id,
      actorRole: ctx.role,
      action: activate ? "membership.reactivate" : "membership.deactivate",
      entityType: "membership",
      entityId: m.id,
      changes: { before: { status: m.status }, after: { status } },
    });
    revalidatePath(PATH);
    return activate ? "Reactivated." : "Deactivated and signed out.";
  });
}

export async function signOutEverywhere(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission("users.manage");
  return run(async () => {
    const m = await membershipInOrg(ctx, String(formData.get("membershipId")));
    await db.delete(sessions).where(eq(sessions.userId, m.userId));
    await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "auth.sessions_revoked", entityType: "user", entityId: m.userId });
    revalidatePath(PATH);
    return "Signed out on every device.";
  });
}

export async function resetTwoFactor(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission("users.manage");
  return run(async () => {
    const m = await membershipInOrg(ctx, String(formData.get("membershipId")));
    if (m.userId === ctx.user.id) fail("Use one of your recovery codes, or ask another admin to reset yours.");
    await db.delete(userMfa).where(eq(userMfa.userId, m.userId));
    await db.delete(sessions).where(eq(sessions.userId, m.userId));
    await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "auth.mfa_reset", entityType: "user", entityId: m.userId });
    revalidatePath(PATH);
    return "Two-factor reset. They'll set it up on their next sign-in.";
  });
}
