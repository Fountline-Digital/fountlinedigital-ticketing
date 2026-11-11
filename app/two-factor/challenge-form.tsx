"use client";
import { useActionState } from "react";
import { verifyChallenge, type MfaState } from "./actions";
import { SignOutButton } from "@/components/sign-out-button";

export function ChallengeForm() {
  const [state, action, pending] = useActionState<MfaState, FormData>(verifyChallenge, {});

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <label className="block text-sm font-medium" htmlFor="code">
          Code
        </label>
        <input
          id="code"
          name="code"
          autoComplete="one-time-code"
          autoFocus
          required
          className="w-full rounded border px-3 py-2 text-lg tracking-widest"
        />
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button disabled={pending} className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50">
          {pending ? "Checking..." : "Continue"}
        </button>
      </form>
      <SignOutButton className="w-full text-sm text-gray-600 underline" />
    </div>
  );
}
