"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmSetup, type MfaState } from "../actions";

export function SetupForm() {
  const [state, action, pending] = useActionState<MfaState, FormData>(confirmSetup, {});
  const [copied, setCopied] = useState(false);

  if (state.recoveryCodes) {
    const codes = state.recoveryCodes;
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-primary/50 bg-muted p-3 text-sm text-foreground">
          <p className="font-medium">Save your recovery codes</p>
          <p className="mt-1">Each one signs you in once if you lose your phone. They won&apos;t be shown again.</p>
        </div>
        <ul className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-3 font-mono text-sm">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={async () => {
            await navigator.clipboard.writeText(codes.join("\n"));
            setCopied(true);
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy codes"}
        </Button>
        <Link href="/dashboard" className={buttonVariants({ size: "lg", className: "w-full" })}>
          I&apos;ve saved them, continue
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="code">6-digit code</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          required
          className="text-center text-lg tracking-[0.4em]"
        />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        Turn on two-factor
      </Button>
    </form>
  );
}
