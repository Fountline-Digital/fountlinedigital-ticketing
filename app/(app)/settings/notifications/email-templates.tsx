"use client";
import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { resetTemplate, saveTemplate } from "./actions";

type Ev = { key: string; label: string; audience: "Team" | "Clients"; subject: string | null; body: string | null };
const PLACEHOLDERS = ["{recipient_name}", "{title}", "{details}", "{ticket_key}", "{org_name}", "{link}"];

export function EmailTemplates({ events }: { events: Ev[] }) {
  const [editing, setEditing] = useState<Ev | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const open = (e: Ev) => {
    setEditing(e);
    setSubject(e.subject ?? "{title}");
    setBody(e.body ?? "{details}");
  };
  const run = (fn: () => Promise<{ ok?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else {
        toast.success(r.ok);
        setEditing(null);
      }
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email wording</CardTitle>
        <CardDescription>
          Change the subject and text of each email. The branded layout and the &quot;Open in portal&quot; button stay the same. Standard wording uses the notification&apos;s own title and details.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {events.map((e) => (
          <div key={e.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{e.label}</p>
              <p className="truncate text-xs text-muted-foreground">{e.subject ? `Subject: ${e.subject}` : "Standard wording"}</p>
            </div>
            <Badge variant="outline">{e.audience}</Badge>
            {e.subject && <Badge>Custom</Badge>}
            <Button size="icon-sm" variant="ghost" aria-label={`Edit ${e.label} email`} onClick={() => open(e)}>
              <Pencil />
            </Button>
          </div>
        ))}
      </CardContent>
      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing.label} email</DialogTitle>
              <DialogDescription>
                Placeholders: {PLACEHOLDERS.join(" ")}. {"{title}"} and {"{details}"} are the standard subject and text.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="tpl-subject">Subject</Label>
                <Input id="tpl-subject" value={subject} maxLength={200} onChange={(ev) => setSubject(ev.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tpl-body">Text</Label>
                <Textarea id="tpl-body" rows={6} value={body} maxLength={5000} onChange={(ev) => setBody(ev.target.value)} placeholder={"Hi {recipient_name},\n\n{details}"} />
              </div>
            </div>
            <DialogFooter className="sm:justify-between">
              {editing.subject ? (
                <Button variant="ghost" disabled={pending} onClick={() => run(() => resetTemplate(editing.key))}>
                  Use standard wording
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button disabled={pending} onClick={() => run(() => saveTemplate(editing.key, subject, body))}>
                  Save
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
