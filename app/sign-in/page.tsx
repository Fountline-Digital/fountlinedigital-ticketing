import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";


const ERRORS: Record<string, string> = {
  no_access: "You don't have access. Ask an admin for an invite.",
  forbidden: "You don't have access. Ask an admin for an invite.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  const { error } = await searchParams;
  if (session && !error) redirect("/dashboard");

  const message = error ? (ERRORS[error.toLowerCase()] ?? "Sign-in didn't work. Please try again.") : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-gray-600">Fountline Digital team, contractors and clients.</p>
      </div>
      {message && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      <SignInForm />
    </main>
  );
}
