import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { userMfa } from "@/db/schema";
import { AuthShell } from "@/components/auth-shell";
import { decryptSecret, encryptSecret, generateSecret, otpauthUri } from "@/lib/mfa";
import { requireSignedIn } from "@/lib/session";
import { SetupForm } from "./setup-form";

export default async function TwoFactorSetupPage() {
  const { user } = await requireSignedIn();

  const [existing] = await db.select().from(userMfa).where(eq(userMfa.userId, user.id)).limit(1);
  if (existing?.enabledAt) redirect("/two-factor");

  // Reuse an in-progress secret so refreshing the page doesn't break a half-finished scan.
  let secret: string;
  if (existing) {
    secret = decryptSecret(existing.totpSecretEncrypted);
  } else {
    secret = generateSecret();
    await db.insert(userMfa).values({ userId: user.id, totpSecretEncrypted: encryptSecret(secret) }).onConflictDoNothing();
  }

  const qr = await QRCode.toDataURL(otpauthUri(secret, user.email), { margin: 1, width: 200 });

  return (
    <AuthShell
      title="Set up two-factor sign-in"
      description="Every account uses an authenticator app, like Google Authenticator, Microsoft Authenticator or 1Password."
    >
      <div className="space-y-5">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Open your authenticator app and add an account.</li>
          <li>Scan the QR code, or type the setup key.</li>
          <li>Enter the 6-digit code the app shows.</li>
        </ol>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR code for your authenticator app" width={200} height={200} className="mx-auto rounded-lg border p-2" />
        <p className="rounded-lg bg-muted p-3 text-center font-mono text-xs break-all">{secret.match(/.{1,4}/g)?.join(" ")}</p>
        <SetupForm />
      </div>
    </AuthShell>
  );
}
