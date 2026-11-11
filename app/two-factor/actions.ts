"use server";
import { redirect } from "next/navigation";
import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, sessions, userMfa } from "@/db/schema";
import { audit } from "@/lib/audit";
import {
  dateOfStep,
  decryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  stepOf,
  verifyTotp,
} from "@/lib/mfa";
import { requireSignedIn } from "@/lib/session";

export type MfaState = { error?: string; recoveryCodes?: string[] };

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

async function isLockedOut(userId: string) {
  const since = new Date(Date.now() - LOCK_MINUTES * 60 * 1000);
  const [row] = await db
    .select({ n: count() })
    .from(auditLog)
    .where(and(eq(auditLog.actorUserId, userId), eq(auditLog.action, "auth.mfa_failed"), gte(auditLog.createdAt, since)));
  return (row?.n ?? 0) >= MAX_FAILURES;
}

async function markSessionVerified(sessionId: string) {
  await db.update(sessions).set({ mfaVerifiedAt: new Date() }).where(eq(sessions.id, sessionId));
}

/** Step 2 of setup: confirm the first code from the authenticator app. */
export async function confirmSetup(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const { user, session } = await requireSignedIn();
  if (await isLockedOut(user.id)) return { error: `Too many attempts. Try again in ${LOCK_MINUTES} minutes.` };

  const [mfa] = await db.select().from(userMfa).where(eq(userMfa.userId, user.id)).limit(1);
  if (!mfa) return { error: "Setup expired. Refresh the page and scan the new code." };
  if (mfa.enabledAt) return { error: "Two-factor is already set up." };

  const step = verifyTotp(decryptSecret(mfa.totpSecretEncrypted), String(formData.get("code") ?? ""), null);
  if (step === null) {
    await audit({ actorUserId: user.id, action: "auth.mfa_failed", entityType: "user", entityId: user.id, metadata: { stage: "setup" } });
    return { error: "That code didn't match. Check the time on your phone and try the newest code." };
  }

  const { codes, hashes } = generateRecoveryCodes();
  await db
    .update(userMfa)
    .set({ enabledAt: new Date(), lastUsedAt: dateOfStep(step), recoveryCodesHashed: hashes })
    .where(eq(userMfa.userId, user.id));
  await markSessionVerified(session.id);
  await audit({ actorUserId: user.id, action: "auth.mfa_enabled", entityType: "user", entityId: user.id });

  return { recoveryCodes: codes };
}

/** Every new sign-in: enter a code from the app, or a recovery code. */
export async function verifyChallenge(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const { user, session } = await requireSignedIn();
  if (await isLockedOut(user.id)) return { error: `Too many attempts. Try again in ${LOCK_MINUTES} minutes.` };

  const [mfa] = await db.select().from(userMfa).where(eq(userMfa.userId, user.id)).limit(1);
  if (!mfa?.enabledAt) redirect("/two-factor/setup");

  const input = String(formData.get("code") ?? "").trim();
  const lastStep = mfa.lastUsedAt ? stepOf(mfa.lastUsedAt) : null;

  if (/^\d{6}$/.test(input.replace(/\s+/g, ""))) {
    const step = verifyTotp(decryptSecret(mfa.totpSecretEncrypted), input, lastStep);
    if (step !== null) {
      await db.update(userMfa).set({ lastUsedAt: dateOfStep(step) }).where(eq(userMfa.userId, user.id));
      await markSessionVerified(session.id);
      await audit({ actorUserId: user.id, action: "auth.mfa_passed", entityType: "session", entityId: session.id });
      redirect("/dashboard");
    }
  } else if (input.length > 0) {
    const hash = hashRecoveryCode(input);
    if (mfa.recoveryCodesHashed.includes(hash)) {
      const remaining = mfa.recoveryCodesHashed.filter((h) => h !== hash);
      await db.update(userMfa).set({ recoveryCodesHashed: remaining }).where(eq(userMfa.userId, user.id));
      await markSessionVerified(session.id);
      await audit({
        actorUserId: user.id,
        action: "auth.mfa_recovery_code_used",
        entityType: "session",
        entityId: session.id,
        metadata: { remaining: remaining.length },
      });
      redirect("/dashboard");
    }
  }

  await audit({ actorUserId: user.id, action: "auth.mfa_failed", entityType: "user", entityId: user.id, metadata: { stage: "challenge" } });
  return { error: "That code didn't work. Try the newest code from your app, or a recovery code." };
}
