"use client";
import { useState, useTransition } from "react";
import { Heart, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { offerDesigns, removeOffer, unlockSelection, type Result } from "./picker-actions";

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

export function OfferDesigns({ projectId, options, remaining }: { projectId: string; options: { id: string; label: string }[]; remaining: number }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus /> Offer designs
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Offer designs</DialogTitle>
            <DialogDescription>Pick up to {remaining}. The client is notified the first time you offer designs.</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-80 gap-2 overflow-y-auto">
            {options.map((o) => (
              <label key={o.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={picked.includes(o.id)}
                  disabled={!picked.includes(o.id) && picked.length >= remaining}
                  onCheckedChange={(c) => setPicked((s) => (c ? [...s, o.id] : s.filter((x) => x !== o.id)))}
                />
                {o.label}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || picked.length === 0}
              onClick={() =>
                run(
                  () => offerDesigns(projectId, picked),
                  (r) => {
                    if (r.ok) {
                      setOpen(false);
                      setPicked([]);
                    }
                  },
                )
              }
            >
              Offer {picked.length || ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function OfferRow({ offerId, name, designKey, favorite, chosen, canRemove }: { offerId: string; name: string; designKey: string; favorite: boolean; chosen: boolean; canRemove: boolean }) {
  const { pending, run } = useRun();
  return (
    <div className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
      {favorite && <Heart className="size-3.5 fill-current text-primary" aria-label="Client favorite" />}
      <span className="min-w-0 flex-1 truncate">
        {name} <span className="font-mono text-xs text-muted-foreground">{designKey}</span>
      </span>
      {chosen && <Badge>Chosen</Badge>}
      {canRemove && (
        <Button size="icon-xs" variant="ghost" aria-label={`Stop offering ${name}`} disabled={pending} onClick={() => run(() => removeOffer(offerId))}>
          <X />
        </Button>
      )}
    </div>
  );
}

export function UnlockButtons({ projectId }: { projectId: string }) {
  const { pending, run } = useRun();
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => confirm("Let the client change their choice? This uses one of the design phase's revision rounds (or creates a change request if none are left).") && run(() => unlockSelection(projectId))}
      >
        Let them change it
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => confirm("Unlock without using a revision round or change request?") && run(() => unlockSelection(projectId, true))}>
        Unlock without charge
      </Button>
    </div>
  );
}
