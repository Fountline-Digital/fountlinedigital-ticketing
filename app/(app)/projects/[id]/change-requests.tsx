"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Ban, Check, FilePlus2, MoreHorizontal, Pencil, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cancelCR, createCR, decideCR, sendCRToClient, updateCR, type CRInput, type Result } from "./change-request-actions";

type Option = { value: string; label: string };
export type CRRow = {
  id: string;
  key: string;
  title: string;
  description: string;
  status: "draft" | "pending_client" | "approved" | "declined" | "cancelled";
  priceCents: number | null;
  estimateMinutes: number | null;
  phaseId: string | null;
  phaseLabel: string | null;
  teamRoleId: string | null;
  ticketKey: string | null;
  decisionComment: string | null;
  mine: boolean;
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const STATUS: Record<CRRow["status"], { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Draft", variant: "outline" },
  pending_client: { label: "Waiting on client", variant: "default" },
  approved: { label: "Approved", variant: "secondary" },
  declined: { label: "Declined", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "outline" },
};
const NONE = "__none";

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

function CRDialog({
  open,
  onOpenChange,
  projectId,
  cr,
  phases,
  teamRoles,
  canPrice,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  cr?: CRRow;
  phases: Option[];
  teamRoles: Option[];
  canPrice: boolean;
}) {
  const { pending, run } = useRun();
  const [title, setTitle] = useState(cr?.title ?? "");
  const [description, setDescription] = useState(cr?.description ?? "");
  const [phaseId, setPhaseId] = useState(cr?.phaseId ?? NONE);
  const [teamRoleId, setTeamRoleId] = useState(cr?.teamRoleId ?? NONE);
  const [price, setPrice] = useState(cr?.priceCents == null ? "" : String(cr.priceCents / 100));
  const [estimate, setEstimate] = useState(cr?.estimateMinutes == null ? "" : String(Math.round((cr.estimateMinutes / 60) * 100) / 100));
  const phaseItems = [{ value: NONE, label: "No phase" }, ...phases];
  const roleItems = [{ value: NONE, label: "No team role" }, ...teamRoles];

  const input = (): CRInput => ({
    title,
    description,
    phaseId: phaseId === NONE ? "" : phaseId,
    teamRoleId: teamRoleId === NONE ? "" : teamRoleId,
    price,
    estimateHours: estimate,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{cr ? `Edit ${cr.key}` : "New change request"}</DialogTitle>
          <DialogDescription>Work outside the package. Once the client approves, it becomes a ticket in the chosen phase.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="cr-title">What&apos;s being asked for</Label>
            <Input id="cr-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Add an online booking page" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cr-desc">Details</Label>
            <Textarea id="cr-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Phase</Label>
              <Select items={phaseItems} value={phaseId} onValueChange={(v) => setPhaseId(String(v ?? NONE))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {phaseItems.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Team role</Label>
              <Select items={roleItems} value={teamRoleId} onValueChange={(v) => setTeamRoleId(String(v ?? NONE))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleItems.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="cr-price">Price (USD)</Label>
              <Input id="cr-price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} disabled={!canPrice} placeholder={canPrice ? "0 for no charge" : "Set by a manager"} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cr-est">Estimate (hours)</Label>
              <Input id="cr-est" type="number" min="0" step="0.25" value={estimate} onChange={(e) => setEstimate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={pending || !title.trim()}
            onClick={() => run(() => (cr ? updateCR(cr.id, input()) : createCR(projectId, input())), (r) => !r.error && onOpenChange(false))}
          >
            {cr ? "Save" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ChangeRequestsCard({
  projectId,
  rows,
  phases,
  teamRoles,
  canManage,
}: {
  projectId: string;
  rows: CRRow[];
  phases: Option[];
  teamRoles: Option[];
  canManage: boolean;
}) {
  const { pending, run } = useRun();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CRRow | null>(null);
  const [deciding, setDeciding] = useState<{ cr: CRRow; approve: boolean } | null>(null);
  const [comment, setComment] = useState("");
  const open = rows.filter((r) => r.status === "draft" || r.status === "pending_client").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change requests</CardTitle>
        <CardDescription>{rows.length === 0 ? "Extra work outside the package, priced and approved by the client." : `${open} open · ${rows.length} total`}</CardDescription>
        <CardAction>
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <FilePlus2 />
            New
          </Button>
        </CardAction>
      </CardHeader>
      {rows.length > 0 && (
        <CardContent>
          <ul className="divide-y">
            {rows.map((cr) => {
              const s = STATUS[cr.status];
              const isOpen = cr.status === "draft" || cr.status === "pending_client";
              const canEdit = isOpen && (canManage || (cr.mine && cr.status === "draft"));
              return (
                <li key={cr.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">{cr.key}</span>
                      <span className="font-medium">{cr.title}</span>
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span>{cr.priceCents === null ? "Not priced" : cr.priceCents === 0 ? "No charge" : money.format(cr.priceCents / 100)}</span>
                      {cr.estimateMinutes !== null && <span>{Math.round((cr.estimateMinutes / 60) * 10) / 10} h</span>}
                      {cr.phaseLabel && <span>{cr.phaseLabel}</span>}
                      {cr.ticketKey && (
                        <Link href={`/tickets/${cr.ticketKey}`} className="hover:text-foreground hover:underline">
                          Ticket {cr.ticketKey}
                        </Link>
                      )}
                      {cr.decisionComment && <span>“{cr.decisionComment}”</span>}
                    </div>
                  </div>
                  {(canEdit || (canManage && isOpen)) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon-sm" aria-label={`${cr.key} actions`}>
                            <MoreHorizontal />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end" className="min-w-52">
                        {canEdit && (
                          <DropdownMenuItem onClick={() => setEditing(cr)}>
                            <Pencil />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {canManage && cr.status === "draft" && (
                          <DropdownMenuItem onClick={() => run(() => sendCRToClient(cr.id))}>
                            <Send />
                            Send to client
                          </DropdownMenuItem>
                        )}
                        {canManage && isOpen && (
                          <>
                            <DropdownMenuItem onClick={() => setDeciding({ cr, approve: true })}>
                              <Check />
                              Record client approval
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDeciding({ cr, approve: false })}>
                              <X />
                              Record client decline
                            </DropdownMenuItem>
                          </>
                        )}
                        {isOpen && (canManage || cr.mine) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={() => run(() => cancelCR(cr.id))}>
                              <Ban />
                              Cancel
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      )}

      {creating && <CRDialog open onOpenChange={setCreating} projectId={projectId} phases={phases} teamRoles={teamRoles} canPrice={canManage} />}
      {editing && (
        <CRDialog open onOpenChange={(o) => !o && setEditing(null)} projectId={projectId} cr={editing} phases={phases} teamRoles={teamRoles} canPrice={canManage} />
      )}

      <Dialog open={deciding !== null} onOpenChange={(o) => !o && setDeciding(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deciding?.approve ? "Record approval" : "Record decline"}: {deciding?.cr.key}
            </DialogTitle>
            <DialogDescription>
              {deciding?.approve
                ? "A ticket is created for the work and routed to the right team."
                : "The request is closed. Nothing is added to the project."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="cr-comment">Note (optional)</Label>
            <Textarea id="cr-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="e.g. Approved by email on Nov 12" />
          </div>
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() =>
                deciding &&
                run(() => decideCR(deciding.cr.id, deciding.approve, comment), (r) => {
                  if (!r.error) {
                    setDeciding(null);
                    setComment("");
                  }
                })
              }
            >
              {deciding?.approve ? "Approve" : "Decline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
