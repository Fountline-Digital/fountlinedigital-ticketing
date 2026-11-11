import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, userMfa } from "@/db/schema";
import { requireSignedIn } from "@/lib/session";
import { ChallengeForm } from "./challenge-form";


export default async function TwoFactorPage() {
  const { user, session } = await requireSignedIn();

  const [mfa] = await db.select().from(userMfa).where(eq(userMfa.userId, user.id)).limit(1);
  if (!mfa?.enabledAt) redirect("/two-factor/setup");

  const [row] = await db.select({ mfaVerifiedAt: sessions.mfaVerifiedAt }).from(sessions).where(eq(sessions.id, session.id)).limit(1);
  if (row?.mfaVerifiedAt) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Two-factor check</h1>
        <p className="mt-2 text-sm text-gray-600">
          Enter the 6-digit code from your authenticator app, or one of your recovery codes.
        </p>
      </div>
      <ChallengeForm />
    </main>
  );
}
