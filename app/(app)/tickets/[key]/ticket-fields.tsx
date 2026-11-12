"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, Pencil, Trash2, X } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { deleteTicket, updateTicket } from "../actions";
import { useTicketAction } from "./use-ticket-action";

type ColorOption = { value: string; label: string; color: string };

export function TicketHeaderEditor({ ticketId, title, description }: { ticketId: string; title: string; description: string }) {
  const { pending, run } = useTicketAction();
  const [editing, setEditing] = useState(false);
  const [t, setT] = useState(title);
  const [d, setD] = useState(description);

  if (!editing) {
    return (
      <div className="group space-y-3">
        <div className="flex items-start gap-2">
          <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight break-words">{title}</h1>
          <Button variant="ghost" size="icon-sm" aria-label="Edit title and description" onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
        </div>
        {description ? (
          <p className="text-sm whitespace-pre-wrap text-foreground/90">{description}</p>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="text-sm text-muted-foreground hover:text-foreground">
            Add a description
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Input value={t} onChange={(e) => setT(e.target.value)} className="text-lg font-semibold" aria-label="Title" />
      <Textarea value={d} onChange={(e) => setD(e.target.value)} rows={6} placeholder="What needs to be done, and what does done look like?" aria-label="Description" />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => run(() => updateTicket(ticketId, { title: t, description: d }), (r) => !r.error && setEditing(false))}
        >
          <Check />
          Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setT(title);
            setD(description);
            setEditing(false);
          }}
        >
          <X />
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ColorSelect({
  label,
  items,
  value,
  onChange,
  disabled,
}: {
  label: string;
  items: ColorOption[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select items={items} value={value} onValueChange={(v) => v && onChange(String(v))} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              <span className="size-2 rounded-full" style={{ backgroundColor: i.color }} />
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const UNASSIGNED = "__none";

export function TicketFields(props: {
  ticketId: string;
  canAssign: boolean;
  canDelete: boolean;
  statusId: string;
  priorityId: string;
  assigneeMembershipId: string | null;
  dueDate: string;
  estimateHours: string;
  isClientVisible: boolean;
  statuses: ColorOption[];
  priorities: ColorOption[];
  assignees: { value: string; label: string }[];
  context: {
    project: { id: string; label: string } | null;
    client: { id: string; label: string } | null;
    reporter: string | null;
    created: string;
  };
}) {
  const { pending, run } = useTicketAction();
  const [status, setStatus] = useState(props.statusId);
  const [priority, setPriority] = useState(props.priorityId);
  const [assignee, setAssignee] = useState(props.assigneeMembershipId ?? UNASSIGNED);
  const [due, setDue] = useState(props.dueDate);
  const [estimate, setEstimate] = useState(props.estimateHours);
  const [clientVisible, setClientVisible] = useState(props.isClientVisible);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const assigneeItems = [{ value: UNASSIGNED, label: "Unassigned" }, ...props.assignees];

  return (
    <Card>
      <CardContent className="grid gap-4">
        <ColorSelect
          label="Status"
          items={props.statuses}
          value={status}
          onChange={(v) => {
            setStatus(v);
            run(() => updateTicket(props.ticketId, { statusId: v }), (r) => r.error && setStatus(props.statusId));
          }}
        />
        <ColorSelect
          label="Priority"
          items={props.priorities}
          value={priority}
          onChange={(v) => {
            setPriority(v);
            run(() => updateTicket(props.ticketId, { priorityId: v }), (r) => r.error && setPriority(props.priorityId), true);
          }}
        />
        <div className="grid gap-1.5">
          <Label>Assignee</Label>
          <Select
            items={assigneeItems}
            value={assignee}
            disabled={!props.canAssign}
            onValueChange={(v) => {
              const next = String(v ?? UNASSIGNED);
              setAssignee(next);
              run(
                () => updateTicket(props.ticketId, { assigneeMembershipId: next === UNASSIGNED ? null : next }),
                (r) => r.error && setAssignee(props.assigneeMembershipId ?? UNASSIGNED),
              );
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {assigneeItems.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="due">Due</Label>
            <Input
              id="due"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              onBlur={() => due !== props.dueDate && run(() => updateTicket(props.ticketId, { dueDate: due || null }), undefined, true)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="estimate">Estimate (h)</Label>
            <Input
              id="estimate"
              type="number"
              min="0"
              step="0.25"
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
              onBlur={() => estimate !== props.estimateHours && run(() => updateTicket(props.ticketId, { estimateHours: estimate }), undefined, true)}
            />
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={clientVisible}
            disabled={pending}
            onCheckedChange={(c) => {
              const next = Boolean(c);
              setClientVisible(next);
              run(() => updateTicket(props.ticketId, { isClientVisible: next }), (r) => r.error && setClientVisible(props.isClientVisible));
            }}
            className="mt-0.5"
          />
          <span>
            Client can see this ticket
            <span className="block text-xs text-muted-foreground">Internal comments always stay hidden.</span>
          </span>
        </label>

        <Separator />

        <dl className="grid gap-2 text-sm">
          {props.context.project && (
            <div>
              <dt className="text-xs text-muted-foreground">Project</dt>
              <dd>
                <Link href={`/projects/${props.context.project.id}`} className="hover:underline">
                  {props.context.project.label}
                </Link>
              </dd>
            </div>
          )}
          {props.context.client && (
            <div>
              <dt className="text-xs text-muted-foreground">Client</dt>
              <dd>
                <Link href={`/clients/${props.context.client.id}`} className="hover:underline">
                  {props.context.client.label}
                </Link>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted-foreground">Created</dt>
            <dd>
              {props.context.created}
              {props.context.reporter ? ` by ${props.context.reporter}` : ""}
            </dd>
          </div>
        </dl>

        {props.canDelete && (
          <>
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 />
              Delete ticket
            </Button>
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this ticket?</AlertDialogTitle>
                  <AlertDialogDescription>It moves to Trash and can be restored for 30 days.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <Button variant="destructive" disabled={pending} onClick={() => run(() => deleteTicket(props.ticketId))}>
                    Delete
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </CardContent>
    </Card>
  );
}
