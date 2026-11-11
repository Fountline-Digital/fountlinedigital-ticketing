import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { auth } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

const ERRORS: Record<string, string> = {
  no_access: "You don't have access. Ask an admin for an invite.",
  forbidden: "You don't have access. Ask an admin for an invite.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const { error, email } = await searchParams;
  if (session && !error) redirect("/dashboard");

  const message = error ? (ERRORS[error.toLowerCase()] ?? "Sign-in didn't work. Please try again.") : null;

  return (
    <AuthShell title="Sign in" description="For the Fountline Digital team, contractors and clients.">
      {message && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{message}</p>
      )}
      <SignInForm initialEmail={email ?? ""} />
    </AuthShell>
  );
}
