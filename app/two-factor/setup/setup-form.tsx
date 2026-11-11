"use client";
import { useActionState } from "react";
import Link from "next/link";
import { confirmSetup, type MfaState } from "../actions";

export function SetupForm() {
  const [state, action, pending] = useActionState<MfaState, FormData>(confirmSetup, {});

  if (state.recoveryCodes) {
    return (
      <div className="space-y-4">
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-semibold">Save your recovery codes</p>
          <p className="mt-1">
            If you lose your phone, each code lets you sign in once. They won&apos;t be shown again. Store them in a
            password manager.
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-2 rounded bg-gray-100 p-4 font-mono text-sm">
          {state.recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Link href="/dashboard" className="block rounded bg-black px-4 py-2 text-center text-white">
          I&apos;ve saved them, continue
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-medium" htmlFor="code">
        6-digit code
      </label>
      <input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        required
        className="w-full rounded border px-3 py-2 text-lg tracking-widest"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50">
        {pending ? "Checking..." : "Turn on two-factor"}
      </button>
    </form>
  );
}
