import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, sessions, userMfa, users } from "@/db/schema";
import { auth } from "@/lib/auth";

/** Signed in, but two-factor not checked yet. Use only on the two-factor pages. */
export async function requireSignedIn() {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) redirect("/sign-in");
  return result;
}

/**
 * Signed in AND passed two-factor in this session. Use on every protected page,
 * server action and API route.
 */
export async function requireUser() {
  const { user, session } = await requireSignedIn();

  const [mfa] = await db.select().from(userMfa).where(eq(userMfa.userId, user.id)).limit(1);
  if (!mfa?.enabledAt) redirect("/two-factor/setup");

  const [row] = await db
    .select({ mfaVerifiedAt: sessions.mfaVerifiedAt })
    .from(sessions)
    .where(eq(sessions.id, session.id))
    .limit(1);
  if (!row?.mfaVerifiedAt) redirect("/two-factor");

  const [account] = await db.select({ isActive: users.isActive }).from(users).where(eq(users.id, user.id)).limit(1);
  if (!account?.isActive) redirect("/sign-in?error=no_access");

  // Contractor access ends automatically at access_expires_at.
  const now = new Date();
  const userMemberships = (
    await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.status, "active")))
  ).filter((m) => !m.accessExpiresAt || m.accessExpiresAt > now);
  if (userMemberships.length === 0) redirect("/sign-in?error=no_access");

  return { user, session, memberships: userMemberships, membership: userMemberships[0] };
}
