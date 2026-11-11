import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, userMfa } from "@/db/schema";
import { AuthShell } from "@/components/auth-shell";
import { requireSignedIn } from "@/lib/session";
import { ChallengeForm } from "./challenge-form";

export default async function TwoFactorPage() {
  const { user, session } = await requireSignedIn();

  const [mfa] = await db.select().from(userMfa).where(eq(userMfa.userId, user.id)).limit(1);
  if (!mfa?.enabledAt) redirect("/two-factor/setup");

  const [row] = await db
    .select({ mfaVerifiedAt: sessions.mfaVerifiedAt })
    .from(sessions)
    .where(eq(sessions.id, session.id))
    .limit(1);
  if (row?.mfaVerifiedAt) redirect("/dashboard");

  return (
    <AuthShell title="Two-factor check" description="Enter the 6-digit code from your authenticator app, or a recovery code.">
      <ChallengeForm />
    </AuthShell>
  );
}
