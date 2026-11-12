import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { clientContacts, clients, invites, memberships, organizations, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { inviteEmail, sendEmail } from "@/lib/email";
import { INVITABLE_ROLES, ROLE_LABELS, type Role } from "@/lib/permissions";
import type { UserContext } from "@/lib/session";

const ROLES: Role[] = ["admin", "manager", "worker", "contractor", "client"];

export type InviteInput = {
  email: string;
  role: Role;
  clientId?: string | null;
  accessEnds?: string | null; // yyyy-mm-dd, contractors
  contact?: { name?: string; isPrimary: boolean; isApprover: boolean; isBilling: boolean };
};

export type InviteResult = { ok?: string; error?: string };

const appUrl = () => process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

async function getOrg(orgId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  return org;
}

export async function sendInviteEmail(ctx: UserContext, inviteId: string) {
  const [invite] = await db.select().from(invites).where(eq(invites.id, inviteId));
  const org = await getOrg(ctx.orgId);
  const domains = (org.settings.allowedGoogleDomains ?? []).map((d) => d.toLowerCase());
  const usesGoogle = domains.includes(invite.email.split("@")[1] ?? "");
  const expiresText = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: org.timezone }).format(
    invite.expiresAt,
  );

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

/** Validates, saves and emails an invite. Used by Users & invites and by client pages. */
export async function createInvite(ctx: UserContext, input: InviteInput): Promise<InviteResult> {
  const email = input.email.trim().toLowerCase();
  const { role } = input;
  const clientId = input.clientId || null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if (!ROLES.includes(role)) return { error: "Choose a role." };
  if (!INVITABLE_ROLES[ctx.role].includes(role)) return { error: `You can't invite someone as ${ROLE_LABELS[role]}.` };
  if (role === "client" && !clientId) return { error: "Choose which client this person belongs to." };

  const org = await getOrg(ctx.orgId);
  const staffDomains = (org.settings.allowedGoogleDomains ?? []).map((d) => d.toLowerCase());
  const isStaffEmail = staffDomains.includes(email.split("@")[1] ?? "");
  if ((role === "admin" || role === "manager" || role === "worker") && !isStaffEmail) {
    return { error: `Team roles need a ${staffDomains.map((d) => "@" + d).join(" or ")} address. Use Contractor for outside help.` };
  }

  if (clientId) {
    const [client] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.orgId, ctx.orgId)));
    if (!client) return { error: "That client wasn't found." };
  }

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
    accessExpiresAt = input.accessEnds
      ? new Date(`${input.accessEnds}T23:59:59`)
      : new Date(Date.now() + (org.settings.contractorDefaultAccessDays ?? 90) * 86_400_000);
  }

  const [invite] = await db
    .insert(invites)
    .values({
      orgId: ctx.orgId,
      email,
      role,
      clientId: role === "client" ? clientId : null,
      accessExpiresAt,
      // Accepted by signing in with this email; the token is only a unique reference.
      tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
      expiresAt: new Date(Date.now() + (org.settings.inviteExpiryHours ?? 72) * 3_600_000),
      invitedByUserId: ctx.user.id,
    })
    .returning();

  if (role === "client" && clientId && input.contact) {
    const [contact] = await db
      .select()
      .from(clientContacts)
      .where(and(eq(clientContacts.clientId, clientId), eq(clientContacts.email, email), isNull(clientContacts.deletedAt)));
    const flags = { isPrimary: input.contact.isPrimary, isApprover: input.contact.isApprover, isBilling: input.contact.isBilling };
    if (contact) {
      await db.update(clientContacts).set(flags).where(eq(clientContacts.id, contact.id));
    } else {
      await db.insert(clientContacts).values({ orgId: ctx.orgId, clientId, name: input.contact.name || email, email, ...flags });
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
    return { error: "Invite saved, but the email didn't send. Use Resend in Users & invites." };
  }
  return { ok: `Invite sent to ${email}.` };
}
