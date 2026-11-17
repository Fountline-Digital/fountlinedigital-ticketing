"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { setLeadStage } from "./actions";

type Opt = { value: string; label: string; kind?: string };
const selectClass = "h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground";

/** Stage picker for a lead. Moving to a Lost stage asks why. */
export function MoveLead({ ticketId, stageId, stages, reasons, label = "Move to" }: { ticketId: string; stageId: string; stages: Opt[]; reasons: Opt[]; label?: string }) {
  const [pending, start] = useTransition();
  const [lostStage, setLostStage] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const move = (to: string, why: string | null = null) =>
    start(async () => {
      const r = await setLeadStage(ticketId, to, why);
      if (r.error) toast.error(r.error);
      else {
        toast.success(r.ok);
        setLostStage(null);
      }
    });

  return (
    <>
      <select
        aria-label={label}
        className={selectClass}
        value={stageId}
        disabled={pending}
        onChange={(e) => {
          const to = stages.find((s) => s.value === e.target.value);
          if (!to || to.value === stageId) return;
          if (to.kind === "lost") setLostStage(to.value);
          else move(to.value);
        }}
      >
        {stages.map((s) => (
          <option key={s.value} value={s.value}>
            {s.value === stageId ? `Stage: ${s.label}` : `Move to ${s.label}`}
          </option>
        ))}
      </select>
      <Dialog open={Boolean(lostStage)} onOpenChange={(o) => !o && setLostStage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Why was it lost?</DialogTitle>
            <DialogDescription>Helps spot patterns later. Reasons are editable in Settings.</DialogDescription>
          </DialogHeader>
          <select aria-label="Lost reason" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose…</option>
            {reasons.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLostStage(null)}>
              Cancel
            </Button>
            <Button disabled={!reason || pending} onClick={() => lostStage && move(lostStage, reason)}>
              Mark lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
