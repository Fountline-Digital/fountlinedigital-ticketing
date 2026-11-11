"use server";
import { randomBytes, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { clientContacts, clients, invites, memberships, organizations, sessions, userMfa, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { inviteEmail, sendEmail } from "@/lib/email";
import { INVITABLE_ROLES, ROLE_LABELS, type Role } from "@/lib/permissions";
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

function appUrl() {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

async function sendInviteEmail(ctx: UserContext, inviteId: string) {
  const [invite] = await db.select().from(invites).where(eq(invites.id, inviteId));
  const org = await orgSettings(ctx.orgId);
  const domains = (org.settings.allowedGoogleDomains ?? []).map((d) => d.toLowerCase());
  const usesGoogle = domains.includes(invite.email.split("@")[1] ?? "");
  const expiresText = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: org.timezone }).format(invite.expiresAt);

  await sendEmail(
    invite.email,
    `You're invited to ${org.name}`,
    inviteEmail({
      orgName: org.name,
      inviterName: ctx.user.name || ctx.user.email,
      roleLabel: ROLE_LABELS[invite.role as Role],
      signInUrl: `${appUrl()}/sign-in?email=${encodeURIComponent(invite.email)}`,
      usesGoogle,
      expiresText,
    }),
  );
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

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "") as Role;
  const clientId = String(formData.get("clientId") ?? "") || null;
  const accessEnds = String(formData.get("accessEnds") ?? "") || null;
  const contactName = String(formData.get("contactName") ?? "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if (!ROLES.includes(role)) return { error: "Choose a role." };
  if (!INVITABLE_ROLES[ctx.role].includes(role)) return { error: `You can't invite someone as ${ROLE_LABELS[role]}.` };
  if (role === "client" && !clientId) return { error: "Choose which client this person belongs to." };

  const org = await orgSettings(ctx.orgId);
  const staffDomains = (org.settings.allowedGoogleDomains ?? []).map((d) => d.toLowerCase());
  const isStaffEmail = staffDomains.includes(email.split("@")[1] ?? "");
  if ((role === "admin" || role === "manager" || role === "worker") && !isStaffEmail) {
    return { error: `Team roles need a ${staffDomains.map((d) => "@" + d).join(" or ")} address. Use Contractor for outside help.` };
  }

  if (clientId) {
    const [client] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.orgId, ctx.orgId)));
    if (!client) return { error: "That client wasn't found." };
  }

  // Already a member?
  const [existingUser] = await db.select().from(users).where(eq(users.email, email));
  if (existingUser) {
    const [m] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.userId, existingUser.id)));
    if (m) return { error: `${email} already has access (${ROLE_LABELS[m.role as Role]}, ${m.status}).` };
  }

  // Replace any open invite for this email.
  await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(and(eq(invites.orgId, ctx.orgId), eq(invites.email, email), isNull(invites.acceptedAt), isNull(invites.revokedAt)));

  let accessExpiresAt: Date | null = null;
  if (role === "contractor") {
    accessExpiresAt = accessEnds
      ? new Date(`${accessEnds}T23:59:59`)
      : new Date(Date.now() + (org.settings.contractorDefaultAccessDays ?? 90) * 86_400_000);
  }

  const hours = org.settings.inviteExpiryHours ?? 72;
  const [invite] = await db
    .insert(invites)
    .values({
      orgId: ctx.orgId,
      email,
      role,
      clientId: role === "client" ? clientId : null,
      accessExpiresAt,
      // The invite is accepted by signing in with this email; the token is only a unique reference.
      tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
      expiresAt: new Date(Date.now() + hours * 3_600_000),
      invitedByUserId: ctx.user.id,
    })
    .returning();

  if (role === "client" && clientId) {
    const [contact] = await db
      .select()
      .from(clientContacts)
      .where(and(eq(clientContacts.clientId, clientId), eq(clientContacts.email, email)));
    const flags = {
      isPrimary: checked(formData.get("isPrimary")),
      isApprover: checked(formData.get("isApprover")),
      isBilling: checked(formData.get("isBilling")),
    };
    if (contact) {
      await db.update(clientContacts).set(flags).where(eq(clientContacts.id, contact.id));
    } else {
      await db.insert(clientContacts).values({ orgId: ctx.orgId, clientId, name: contactName || email, email, ...flags });
    }
  }

  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    action: "invite.create",
    entityType: "invite",
    entityId: invite.id,
    changes: { after: { email, role, clientId, accessExpiresAt } },
  });

  try {
    await sendInviteEmail(ctx, invite.id);
  } catch (err) {
    console.error(err);
    revalidatePath(PATH);
    return { error: "Invite saved, but the email didn't send. Use Resend in the invites list.", at: Date.now() };
  }

  revalidatePath(PATH);
  return { ok: `Invite sent to ${email}.`, at: Date.now() };
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
