"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: "/two-factor" });
    setBusy(false);
    if (error) setError(error.message ?? "Couldn't send the link. Please try again.");
    else setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded border p-4 text-sm">
        <p className="font-medium">Check your email</p>
        <p className="mt-1 text-gray-600">
          If {email} has access, a sign-in link is on its way. It expires in 10 minutes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/two-factor" })}
        className="w-full rounded border px-4 py-2 font-medium hover:bg-gray-50"
      >
        Continue with Google (team)
      </button>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="h-px flex-1 bg-gray-200" /> or <span className="h-px flex-1 bg-gray-200" />
      </div>

      <form onSubmit={sendLink} className="space-y-3">
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50">
          {busy ? "Sending..." : "Email me a sign-in link"}
        </button>
      </form>
    </div>
  );
}
