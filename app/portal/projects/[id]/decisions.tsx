"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { decideChangeRequest, decidePhase, type Result } from "../../actions";

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, after?: (r: Result) => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else if (r.ok) toast.success(r.ok);
      after?.(r);
    });
  return { pending, run };
}

export function PhaseDecision({ phaseId, phaseName, readOnly, lastRound }: { phaseId: string; phaseName: string; readOnly: boolean; lastRound: boolean }) {
  const { pending, run } = useRun();
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const [comment, setComment] = useState("");

  if (mode === "changes") {
    return (
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => decidePhase(phaseId, false, comment), (r) => r.ok && setMode("idle"));
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor={`changes-${phaseId}`}>What would you like changed?</Label>
          <Textarea id={`changes-${phaseId}`} rows={5} value={comment} onChange={(e) => setComment(e.target.value)} required placeholder="Be as specific as you can: which page, what to change, and how." />
          {lastRound && <p className="text-xs text-muted-foreground">You&apos;ve used the included revision rounds, so more changes will come as a change request for you to approve.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || readOnly || !comment.trim()}>
            Send change request
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode("idle")}>
            Back
          </Button>
        </div>
      </form>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={pending || readOnly} onClick={() => confirm(`Approve ${phaseName}? This moves your project to the next step.`) && run(() => decidePhase(phaseId, true, ""))}>
        Approve
      </Button>
      <Button variant="outline" disabled={readOnly} onClick={() => setMode("changes")}>
        Request changes
      </Button>
    </div>
  );
}

export function ChangeRequestDecision({ crId, title, readOnly }: { crId: string; title: string; readOnly: boolean }) {
  const { pending, run } = useRun();
  const [comment, setComment] = useState("");
  return (
    <div className="space-y-2">
      <Textarea aria-label={`Comment on ${title} (optional)`} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment (optional)" />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending || readOnly} onClick={() => confirm(`Approve “${title}”?`) && run(() => decideChangeRequest(crId, true, comment))}>
          Approve
        </Button>
        <Button size="sm" variant="outline" disabled={pending || readOnly} onClick={() => run(() => decideChangeRequest(crId, false, comment))}>
          Decline
        </Button>
      </div>
    </div>
  );
}
