import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { magicLink } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accounts, clientContacts, invites, memberships, organizations, sessions, users, verifications } from "@/db/schema";
import { audit } from "@/lib/audit";
import { magicLinkEmail, sendEmail } from "@/lib/email";

const forbidden = (message: string) => new APIError("FORBIDDEN", { message });

async function findOpenInvite(email: string) {
  const [invite] = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.email, email.toLowerCase()),
        isNull(invites.acceptedAt),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return invite ?? null;
}

async function findUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return user ?? null;
}

// Staff Google sign-in must use an allowed Workspace domain (org setting).
async function isAllowedGoogleDomain(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  const orgs = await db.select({ settings: organizations.settings }).from(organizations);
  return orgs.some((o) => (o.settings.allowedGoogleDomains ?? []).map((d) => d.toLowerCase()).includes(domain ?? ""));
}

/**
 * Makes sure the user has at least one usable membership, accepting a pending
 * invite if that's their first sign-in. Throws if they have no access.
 */
async function ensureAccess(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.isActive) throw forbidden("This account is not active.");

  const invite = await findOpenInvite(user.email);
  if (invite) {
    await db
      .insert(memberships)
      .values({
        orgId: invite.orgId,
        userId: user.id,
        role: invite.role,
        status: "active",
        clientId: invite.clientId,
        accessExpiresAt: invite.accessExpiresAt,
        invitedByUserId: invite.invitedByUserId,
      })
      .onConflictDoNothing();
    await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
    // Client invites: link the contact record created with the invite to this login.
    if (invite.clientId) {
      await db
        .update(clientContacts)
        .set({ userId: user.id })
        .where(and(eq(clientContacts.clientId, invite.clientId), eq(clientContacts.email, user.email)));
    }
    await audit({ orgId: invite.orgId, actorUserId: user.id, actorRole: invite.role, action: "invite.accept", entityType: "invite", entityId: invite.id });
  }

  const rows = await db.select().from(memberships).where(eq(memberships.userId, user.id));
  const now = new Date();
  const usable = rows.filter((m) => {
    if (m.status === "invited") return true; // activated below
    return m.status === "active" && (!m.accessExpiresAt || m.accessExpiresAt > now);
  });
  if (usable.length === 0) throw forbidden("You don't have access. Ask an admin for an invite.");

  for (const m of usable.filter((m) => m.status === "invited")) {
    await db.update(memberships).set({ status: "active" }).where(eq(memberships.id, m.id));
  }
  return { user, membership: usable[0] };
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [process.env.BETTER_AUTH_URL].filter((o): o is string => Boolean(o)),

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, session: sessions, account: accounts, verification: verifications },
  }),

  advanced: {
    database: { generateId: () => crypto.randomUUID() },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily while in use
  },

  account: {
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      prompt: "select_account",
    },
  },

  onAPIError: { errorURL: "/sign-in" },

  plugins: [
    magicLink({
      expiresIn: 60 * 10, // 10 minutes
      sendMagicLink: async ({ email, url }) => {
        // Invite-only: quietly skip unknown emails so the form doesn't reveal who has an account.
        const known = (await findUserByEmail(email)) ?? (await findOpenInvite(email));
        if (!known) {
          await audit({ actorKind: "system", action: "auth.magic_link_skipped", metadata: { email } });
          return;
        }
        await sendEmail(email, "Your Fountline Digital sign-in link", magicLinkEmail(url));
        await audit({ actorKind: "system", action: "auth.magic_link_sent", metadata: { email } });
      },
    }),
    nextCookies(), // must be last
  ],

  databaseHooks: {
    user: {
      create: {
        // Invite-only: a new user can only be created from an open invite.
        before: async (user) => {
          const invite = await findOpenInvite(user.email);
          if (!invite) {
            await audit({ actorKind: "system", action: "auth.sign_up_blocked", metadata: { email: user.email } });
            throw forbidden("You don't have access. Ask an admin for an invite.");
          }
          return { data: { ...user, email: user.email.toLowerCase() } };
        },
      },
    },
    account: {
      create: {
        before: async (account) => {
          if (account.providerId === "google") {
            const [user] = await db.select().from(users).where(eq(users.id, account.userId)).limit(1);
            if (!user || !(await isAllowedGoogleDomain(user.email))) {
              throw forbidden("Google sign-in is only for team accounts. Use the email link instead.");
            }
          }
          return { data: account };
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          await ensureAccess(session.userId);
          return { data: session };
        },
        after: async (session) => {
          const [m] = await db.select().from(memberships).where(eq(memberships.userId, session.userId)).limit(1);
          await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, session.userId));
          await audit({
            orgId: m?.orgId,
            actorUserId: session.userId,
            actorRole: m?.role,
            action: "auth.sign_in",
            entityType: "session",
            entityId: session.id,
            ipAddress: session.ipAddress || null,
            userAgent: session.userAgent || null,
          });
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
