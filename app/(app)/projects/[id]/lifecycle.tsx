"use client";
import { useState, useTransition } from "react";
import { Archive, Ban, CheckCircle2, Circle, MoreHorizontal, Pause, Pencil, Play, Send, ThumbsUp, Undo2, XCircle } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  decidePhase,
  recordClientSignOff,
  sendForSignOff,
  setProjectStatus,
  toggleCloseoutItem,
  updateProjectDetails,
  type Result,
} from "./lifecycle-actions";

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, after?: (r: Result) => void, quiet = false) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else if (r.ok && !quiet) toast.success(r.ok);
      after?.(r);
    });
  return { pending, run };
}

// ---- Header: edit details + status ----------------------------------------------

type Status = "active" | "on_hold" | "completed" | "archived" | "cancelled";

export function ProjectActions({
  projectId,
  status,
  name,
  startDate,
  targetLaunchDate,
}: {
  projectId: string;
  status: Status;
  name: string;
  startDate: string;
  targetLaunchDate: string;
}) {
  const { pending, run } = useRun();
  const [editOpen, setEditOpen] = useState(false);
  const [n, setN] = useState(name);
  const [start, setStart] = useState(startDate);
  const [launch, setLaunch] = useState(targetLaunchDate);
  const [confirm, setConfirm] = useState<{ status: Status; title: string; body: string; force?: boolean } | null>(null);

  const change = (s: Status, force = false) =>
    run(() => setProjectStatus(projectId, s, force), (r) => {
      if (r.error && s === "completed" && !force) {
        setConfirm({ status: "completed", title: "Complete anyway?", body: `${r.error} You can still mark the project complete.`, force: true });
      } else setConfirm(null);
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="icon" aria-label="Project actions">
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil />
            Edit details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {status !== "active" && (
            <DropdownMenuItem onClick={() => change("active")}>
              <Play />
              {status === "on_hold" ? "Resume" : "Reopen"}
            </DropdownMenuItem>
          )}
          {status === "active" && (
            <DropdownMenuItem onClick={() => change("on_hold")}>
              <Pause />
              Put on hold
            </DropdownMenuItem>
          )}
          {(status === "active" || status === "on_hold") && (
            <DropdownMenuItem onClick={() => change("completed")}>
              <CheckCircle2 />
              Mark complete
            </DropdownMenuItem>
          )}
          {status !== "archived" && (
            <DropdownMenuItem
              onClick={() =>
                setConfirm({ status: "archived", title: "Archive this project?", body: "It becomes read-only and leaves the active lists. You can reopen it later." })
              }
            >
              <Archive />
              Archive
            </DropdownMenuItem>
          )}
          {status !== "cancelled" && status !== "archived" && (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirm({ status: "cancelled", title: "Cancel this project?", body: "Its tickets stay as they are. You can reopen it later." })}
            >
              <Ban />
              Cancel project
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
            <DialogDescription>The client and package can&apos;t change after a project starts.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="pe-name">Name</Label>
              <Input id="pe-name" value={n} onChange={(e) => setN(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="pe-start">Start date</Label>
                <Input id="pe-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pe-launch">Target launch</Label>
                <Input id="pe-launch" type="date" value={launch} onChange={(e) => setLaunch(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => run(() => updateProjectDetails(projectId, { name: n, startDate: start, targetLaunchDate: launch }), (r) => !r.error && setEditOpen(false))}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <Button
              variant={confirm?.status === "cancelled" ? "destructive" : "default"}
              disabled={pending}
              onClick={() => confirm && change(confirm.status, Boolean(confirm.force))}
            >
              Confirm
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---- Phase sign-off ----------------------------------------------------------------

type Approval = { kind: "manager" | "client"; decision: "pending" | "approved" | "rejected"; by: string | null; comment: string | null };

export function PhaseGate({
  phaseId,
  status,
  gate,
  approvals,
  canManage,
  roundsUsed,
  roundsAllowed,
}: {
  phaseId: string;
  status: string;
  gate: string;
  approvals: Approval[];
  canManage: boolean;
  roundsUsed: number;
  roundsAllowed: number;
}) {
  const { pending, run } = useRun();
  const [changesFor, setChangesFor] = useState<"manager" | "client" | null>(null);
  const [comment, setComment] = useState("");
  const kinds: ("manager" | "client")[] = gate === "both" ? ["manager", "client"] : gate === "manager" ? ["manager"] : gate === "client" ? ["client"] : [];
  if (kinds.length === 0) return null;

  if (status === "active") {
    return canManage ? (
      <Button variant="ghost" size="xs" disabled={pending} onClick={() => run(() => sendForSignOff(phaseId))}>
        <Send />
        Send for sign-off
      </Button>
    ) : null;
  }
  if (status !== "awaiting_approval") return null;

  const nextRound = roundsUsed + 1;
  return (
    <div className="space-y-2 rounded-lg border border-primary/60 p-3">
      <p className="text-sm font-medium">Waiting for sign-off</p>
      <ul className="space-y-2">
        {kinds.map((k) => {
          const a = approvals.find((x) => x.kind === k);
          const decision = a?.decision ?? "pending";
          return (
            <li key={k} className="flex flex-wrap items-center gap-2 text-sm">
              {decision === "approved" ? (
                <CheckCircle2 className="size-4" />
              ) : decision === "rejected" ? (
                <XCircle className="size-4 text-destructive" />
              ) : (
                <Circle className="size-4 text-muted-foreground" />
              )}
              <span className="w-16">{k === "manager" ? "Manager" : "Client"}</span>
              {decision === "approved" ? (
                <Badge variant="secondary">Approved{a?.by ? ` by ${a.by}` : ""}</Badge>
              ) : (
                canManage && (
                  <span className="flex flex-wrap gap-1.5">
                    <Button size="xs" disabled={pending} onClick={() => run(() => decidePhase(phaseId, k, true, ""))}>
                      <ThumbsUp />
                      {k === "manager" ? "Approve" : "Record client approval"}
                    </Button>
                    <Button size="xs" variant="outline" disabled={pending} onClick={() => setChangesFor(k)}>
                      <Undo2 />
                      Request changes
                    </Button>
                  </span>
                )
              )}
            </li>
          );
        })}
      </ul>
      {kinds.includes("client") && (
        <p className="text-xs text-muted-foreground">Clients will approve in their portal. Until then you can record their approval here.</p>
      )}

      <Dialog open={changesFor !== null} onOpenChange={(o) => !o && setChangesFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request changes</DialogTitle>
            <DialogDescription>
              {nextRound > roundsAllowed
                ? `All ${roundsAllowed} revision rounds are used, so this becomes a change request for you to price and send to the client.`
                : `Uses revision round ${nextRound} of ${roundsAllowed}. The phase goes back to active with a revision ticket.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="changes">{changesFor === "client" ? "What did the client ask for?" : "What needs to change?"}</Label>
            <Textarea id="changes" value={comment} onChange={(e) => setComment(e.target.value)} rows={4} />
          </div>
          <DialogFooter>
            <Button
              disabled={pending || !comment.trim()}
              onClick={() =>
                changesFor &&
                run(() => decidePhase(phaseId, changesFor, false, comment), (r) => {
                  if (!r.error) {
                    setChangesFor(null);
                    setComment("");
                  }
                })
              }
            >
              Request changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- Closeout ------------------------------------------------------------------------

export function CloseoutCard({
  projectId,
  items,
  signedOff,
  canManage,
  allPhasesComplete,
  status,
}: {
  projectId: string;
  items: { id: string; label: string; done: boolean }[];
  signedOff: string | null;
  canManage: boolean;
  allPhasesComplete: boolean;
  status: string;
}) {
  const { pending, run } = useRun();
  const done = items.filter((i) => i.done).length;
  const ready = allPhasesComplete && done === items.length;

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Closeout</CardTitle>
        <CardDescription>
          {items.length === 0 ? "No closeout checklist on this package." : `${done} of ${items.length} done`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((i) => (
          <label key={i.id} className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={i.done}
              disabled={!canManage || pending}
              onCheckedChange={(c) => run(() => toggleCloseoutItem(i.id, Boolean(c)), undefined, true)}
              className="mt-0.5"
            />
            <span className={i.done ? "text-muted-foreground line-through" : undefined}>{i.label}</span>
          </label>
        ))}
        <div className="space-y-2 border-t pt-3 text-sm">
          {signedOff ? (
            <p className="flex items-center gap-1.5">
              <CheckCircle2 className="size-4" /> Client signed off {signedOff}
            </p>
          ) : (
            canManage && (
              <Button variant="outline" size="sm" className="w-full" disabled={pending} onClick={() => run(() => recordClientSignOff(projectId))}>
                Record final client sign-off
              </Button>
            )
          )}
          {canManage && status !== "completed" && status !== "archived" && (
            <Button size="sm" className="w-full" disabled={pending || !ready} onClick={() => run(() => setProjectStatus(projectId, "completed"))}>
              <CheckCircle2 />
              Complete project
            </Button>
          )}
          {!ready && status !== "completed" && (
            <p className="text-xs text-muted-foreground">
              {allPhasesComplete ? "Finish the checklist to complete the project." : "Available once every phase is complete."}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
