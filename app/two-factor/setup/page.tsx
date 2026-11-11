import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { userMfa } from "@/db/schema";
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

  const qr = await QRCode.toDataURL(otpauthUri(secret, user.email), { margin: 1, width: 220 });

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Set up two-factor sign-in</h1>
        <p className="mt-2 text-sm text-gray-600">
          Every account needs an authenticator app, like Google Authenticator, Microsoft Authenticator or 1Password.
        </p>
      </div>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>Open your authenticator app and add a new account.</li>
        <li>Scan this QR code, or type the setup key below.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt="QR code for your authenticator app" width={220} height={220} className="self-center rounded border" />
      <p className="break-all rounded bg-gray-100 p-3 text-center font-mono text-sm">{secret.match(/.{1,4}/g)?.join(" ")}</p>
      <SetupForm />
    </main>
  );
}
