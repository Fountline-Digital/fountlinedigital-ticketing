"use client";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignOutButton } from "@/components/sign-out-button";
import { verifyChallenge, type MfaState } from "./actions";

export function ChallengeForm() {
  const [state, action, pending] = useActionState<MfaState, FormData>(verifyChallenge, {});

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="code">Code</Label>
          <Input
            id="code"
            name="code"
            autoComplete="one-time-code"
            autoFocus
            required
            className="text-center text-lg tracking-[0.4em]"
          />
        </div>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Continue
        </Button>
      </form>
      <SignOutButton variant="link" className="w-full text-muted-foreground">
        Sign in with a different account
      </SignOutButton>
    </div>
  );
}
