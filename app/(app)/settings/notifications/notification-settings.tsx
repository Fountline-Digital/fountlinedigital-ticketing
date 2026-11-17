"use client";
import { useState, useTransition } from "react";
import { Mail, MoreHorizontal, Pencil, Plus, Send, Trash2 } from "lucide-react";
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
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addWebhook,
  deleteWebhook,
  retryFailedEmails,
  saveEmailSettings,
  sendTestEmail,
  testWebhook,
  updateWebhook,
  type Result,
} from "./actions";

type EventOpt = { value: string; label: string; hint: string };
type Hook = { id: string; name: string; events: string[]; isActive: boolean };

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

export function EmailCard({ senderName, replyTo, stats }: { senderName: string; replyTo: string; stats: { sent: number; pending: number; failed: number } }) {
  const { pending, run } = useRun();
  const [name, setName] = useState(senderName);
  const [reply, setReply] = useState(replyTo);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-4" />
          Email
        </CardTitle>
        <CardDescription>
          Last 7 days: {stats.sent} sent{stats.pending > 0 && `, ${stats.pending} waiting`}
          {stats.failed > 0 && <span className="text-destructive">, {stats.failed} failed</span>}.
        </CardDescription>
        <CardAction className="flex gap-2">
          {stats.failed > 0 && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => retryFailedEmails())}>
              Retry failed
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => sendTestEmail())}>
            <Send /> Send me a test
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveEmailSettings({ senderName: name, replyTo: reply }));
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="sender">Sender name</Label>
            <Input id="sender" value={name} maxLength={60} placeholder="Fountline Digital" onChange={(e) => setName(e.target.value)} />
            <p className="text-xs text-muted-foreground">Shown as who the email is from. The address stays the same.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="reply">Reply-to address</Label>
            <Input id="reply" type="email" value={reply} placeholder="support@fountlinedigital.com" onChange={(e) => setReply(e.target.value)} />
            <p className="text-xs text-muted-foreground">Where replies go. Leave empty to use the sending address.</p>
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" disabled={pending || (name === senderName && reply === replyTo)}>
              Save
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function EventPicker({ events, chosen, onChange }: { events: EventOpt[]; chosen: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="grid gap-2">
      {events.map((e) => (
        <label key={e.value} className="flex items-start gap-2 text-sm">
          <Checkbox
            className="mt-0.5"
            checked={chosen.includes(e.value)}
            onCheckedChange={(c) => onChange(c ? [...chosen, e.value] : chosen.filter((x) => x !== e.value))}
          />
          <span>
            <span className="font-medium">{e.label}</span>
            <span className="block text-xs text-muted-foreground">{e.hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function HookDialog({ open, onOpenChange, hook, events }: { open: boolean; onOpenChange: (o: boolean) => void; hook?: Hook; events: EventOpt[] }) {
  const { pending, run } = useRun();
  const [name, setName] = useState(hook?.name ?? "");
  const [url, setUrl] = useState("");
  const [chosen, setChosen] = useState<string[]>(hook?.events ?? events.map((e) => e.value));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{hook ? `Edit ${hook.name}` : "Add a Discord channel"}</DialogTitle>
          <DialogDescription>
            In Discord: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL. Paste it here.
          </DialogDescription>
        </DialogHeader>
        <form
          id="hook-form"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => (hook ? updateWebhook(hook.id, { name, events: chosen, url: url || undefined }) : addWebhook({ name, url, events: chosen })),
              (r) => r.ok && onOpenChange(false),
            );
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="hook-name">Name</Label>
            <Input id="hook-name" value={name} placeholder="#projects" onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="hook-url">Webhook URL</Label>
            <Input
              id="hook-url"
              type="url"
              value={url}
              placeholder={hook ? "Leave empty to keep the current one" : "https://discord.com/api/webhooks/…"}
              onChange={(e) => setUrl(e.target.value)}
              required={!hook}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">Stored encrypted. Anyone with this link can post to the channel, so don't share it.</p>
          </div>
          <div className="grid gap-1.5">
            <Label>Post when</Label>
            <EventPicker events={events} chosen={chosen} onChange={setChosen} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="hook-form" disabled={pending}>
            {hook ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DiscordCard({ hooks, events }: { hooks: Hook[]; events: EventOpt[] }) {
  const { pending, run } = useRun();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Hook | null>(null);
  const [removing, setRemoving] = useState<Hook | null>(null);
  const label = (key: string) => events.find((e) => e.value === key)?.label ?? key;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Discord</CardTitle>
        <CardDescription>Post team updates to Discord channels. These go to the channel, not to individual people.</CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus /> Add channel
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2">
        {hooks.length === 0 && <p className="text-sm text-muted-foreground">No channels yet.</p>}
        {hooks.map((h) => (
          <div key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                {h.name}
                {!h.isActive && <Badge variant="outline">Paused</Badge>}
              </p>
              <p className="text-xs text-muted-foreground">{h.events.map(label).join(" · ")}</p>
            </div>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => testWebhook(h.id))}>
              Test
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`More for ${h.name}`} />}>
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditing(h)}>
                  <Pencil /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => run(() => updateWebhook(h.id, { isActive: !h.isActive }))}>{h.isActive ? "Pause" : "Turn on"}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setRemoving(h)}>
                  <Trash2 /> Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </CardContent>

      {adding && <HookDialog open onOpenChange={setAdding} events={events} />}
      {editing && <HookDialog key={editing.id} open hook={editing} onOpenChange={(o) => !o && setEditing(null)} events={events} />}

      <AlertDialog open={Boolean(removing)} onOpenChange={(o: boolean) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>The portal stops posting there. The webhook itself stays in Discord until you delete it there.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={pending} onClick={() => removing && run(() => deleteWebhook(removing.id), () => setRemoving(null))}>
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
