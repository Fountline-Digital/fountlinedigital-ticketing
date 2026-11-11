"use client";
import { useState, useTransition } from "react";
import { Archive, CheckCircle2, Loader2, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { discardDraft, publishDraft, setPackageStatus, type ActionResult } from "../actions";

function useRun() {
  const [pending, start] = useTransition();
  const run = (action: (fd: FormData) => Promise<ActionResult>, fields: Record<string, string>, after?: () => void) =>
    start(async () => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      const r = await action(fd);
      if (r.error) toast.error(r.error);
      if (r.ok) toast.success(r.ok);
      after?.();
    });
  return { pending, run };
}

export function PublishBar({ packageId, version, packageKey }: { packageId: string; version: number; packageKey: string }) {
  const { pending, run } = useRun();
  const [publishOpen, setPublishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [notes, setNotes] = useState("");

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary bg-black p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">Unpublished changes in draft v{version}</p>
        <p className="text-sm text-muted-foreground">New projects keep using the live version until you publish.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setDiscardOpen(true)} disabled={pending}>
          <RotateCcw />
          Discard
        </Button>
        <Button onClick={() => setPublishOpen(true)} disabled={pending}>
          <Upload />
          Publish v{version}
        </Button>
      </div>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Publish {packageKey}-v{version}?
            </DialogTitle>
            <DialogDescription>New projects will use this version. Projects already running won&apos;t change.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="notes">What changed? (optional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="e.g. Added an SEO task to Build" />
          </div>
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => run(publishDraft, { packageId, notes }, () => setPublishOpen(false))}
            >
              {pending && <Loader2 className="animate-spin" />}
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard draft v{version}?</AlertDialogTitle>
            <AlertDialogDescription>All unpublished changes to settings and the template will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <Button variant="destructive" disabled={pending} onClick={() => run(discardDraft, { packageId }, () => setDiscardOpen(false))}>
              Discard
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function StatusActions({ packageId, status, hasVersion }: { packageId: string; status: string; hasVersion: boolean }) {
  const { pending, run } = useRun();
  const [retireOpen, setRetireOpen] = useState(false);

  if (status === "retired") {
    return (
      <Button variant="outline" disabled={pending} onClick={() => run(setPackageStatus, { packageId, status: "active" })}>
        <RotateCcw />
        Bring back
      </Button>
    );
  }

  return (
    <div className="flex gap-2">
      {status === "draft" && (
        <Button disabled={pending || !hasVersion} onClick={() => run(setPackageStatus, { packageId, status: "active" })}>
          <CheckCircle2 />
          Activate
        </Button>
      )}
      {status === "active" && (
        <Button variant="outline" disabled={pending} onClick={() => setRetireOpen(true)}>
          <Archive />
          Retire
        </Button>
      )}
      <AlertDialog open={retireOpen} onOpenChange={setRetireOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire this package?</AlertDialogTitle>
            <AlertDialogDescription>
              It can&apos;t be used for new projects. Projects already using it aren&apos;t affected, and you can bring it back later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button disabled={pending} onClick={() => run(setPackageStatus, { packageId, status: "retired" }, () => setRetireOpen(false))}>
              Retire
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
