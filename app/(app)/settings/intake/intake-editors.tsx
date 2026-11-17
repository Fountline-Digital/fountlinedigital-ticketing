"use client";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteRule,
  moveRule,
  saveAssignmentRule,
  saveContactRule,
  saveRequestForm,
  saveSpam,
  setRuleActive,
  type AssignInput,
  type ContactRuleInput,
  type FormFieldInput,
  type Result,
  type RuleTable,
} from "./actions";

type Opt = { value: string; label: string };
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground";

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

function Select({ id, value, onChange, options, empty }: { id: string; value: string; onChange: (v: string) => void; options: Opt[]; empty?: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** One rule in a list: order arrows, name + summary, on/off and a menu. */
function RuleRow({ table, id, name, summary, isActive, first, last, onEdit }: { table: RuleTable; id: string; name: string; summary: string; isActive: boolean; first: boolean; last: boolean; onEdit: () => void }) {
  const { pending, run } = useRun();
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 ${isActive ? "" : "opacity-60"}`}>
      <div className="flex">
        <Button size="icon-xs" variant="ghost" aria-label={`Move ${name} up`} disabled={pending || first} onClick={() => run(() => moveRule(table, id, -1))}>
          <ArrowUp />
        </Button>
        <Button size="icon-xs" variant="ghost" aria-label={`Move ${name} down`} disabled={pending || last} onClick={() => run(() => moveRule(table, id, 1))}>
          <ArrowDown />
        </Button>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{summary}</p>
      </div>
      {!isActive && <Badge variant="secondary">Off</Badge>}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`More for ${name}`} />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => run(() => setRuleActive(table, id, !isActive))}>
            <Power /> {isActive ? "Turn off" : "Turn on"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => confirm(`Delete ${name}?`) && run(() => deleteRule(table, id))}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contact form rules
// ---------------------------------------------------------------------------

type ContactRule = ContactRuleInput & { id: string; isActive: boolean; summary: string };
const FORM_KEYS = ["service", "package", "timeline", "contact method"];

function ContactRuleDialog({ rule, types, priorities, people, onClose }: { rule: ContactRule | null; types: Opt[]; priorities: Opt[]; people: Opt[]; onClose: () => void }) {
  const { pending, run } = useRun();
  const [v, setV] = useState<ContactRuleInput>(
    rule ?? { name: "", conditions: [{ key: "service", values: [] }], ticketTypeId: types[0]?.value ?? "", priorityId: priorities[0]?.value ?? "", assigneeMembershipId: "", titleTemplate: "New inquiry: {name}", checklist: [] },
  );
  const set = <K extends keyof ContactRuleInput>(k: K, value: ContactRuleInput[K]) => setV((s) => ({ ...s, [k]: value }));
  const setCond = (i: number, patch: Partial<{ key: string; values: string[] }>) => set("conditions", v.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{rule ? `Edit ${rule.name}` : "New contact form rule"}</DialogTitle>
          <DialogDescription>Rules are checked top to bottom; the first one whose conditions all match is used.</DialogDescription>
        </DialogHeader>
        <form
          id="contact-rule"
          className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveContactRule(rule?.id ?? null, v), (r) => r.ok && onClose());
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="cr-name">Name</Label>
            <Input id="cr-name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Web inquiry" required />
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">When the form says…</legend>
            <p className="text-xs text-muted-foreground">Any of the values matches (not case sensitive). No conditions = catches everything, so put a catch-all last.</p>
            <datalist id="form-keys">
              {FORM_KEYS.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
            {v.conditions.map((c, i) => (
              <div key={i} className="grid grid-cols-[9rem_1fr_auto] items-center gap-2">
                <Input aria-label="Form field" list="form-keys" value={c.key} onChange={(e) => setCond(i, { key: e.target.value })} placeholder="service" />
                <Input aria-label="Values" value={c.values.join(", ")} onChange={(e) => setCond(i, { values: e.target.value.split(",") })} placeholder="Web, Mobile Apps" />
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove condition" onClick={() => set("conditions", v.conditions.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => set("conditions", [...v.conditions, { key: "", values: [] }])}>
              <Plus /> Add condition
            </Button>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cr-type">Ticket type</Label>
              <Select id="cr-type" value={v.ticketTypeId} onChange={(x) => set("ticketTypeId", x)} options={types} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cr-prio">Priority</Label>
              <Select id="cr-prio" value={v.priorityId} onChange={(x) => set("priorityId", x)} options={priorities} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cr-who">Assign to</Label>
              <Select id="cr-who" value={v.assigneeMembershipId} onChange={(x) => set("assigneeMembershipId", x)} options={people} empty="Automatic" />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">Automatic = your default-assignee rules for leads (including round robin), then the Sales team.</p>
          <div className="grid gap-1.5">
            <Label htmlFor="cr-title">Ticket title</Label>
            <Input id="cr-title" value={v.titleTemplate} onChange={(e) => set("titleTemplate", e.target.value)} />
            <p className="text-xs text-muted-foreground">Placeholders: {"{name}"} {"{company}"} {"{email}"} {"{service}"} {"{package}"} {"{timeline}"}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cr-check">Checklist (one per line)</Label>
            <Textarea id="cr-check" rows={3} value={v.checklist.join("\n")} onChange={(e) => set("checklist", e.target.value.split("\n"))} placeholder={"Reply within 1 business day\nSchedule a discovery call"} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="contact-rule" disabled={pending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ContactRules({ rules, types, priorities, people }: { rules: ContactRule[]; types: Opt[]; priorities: Opt[]; people: Opt[] }) {
  const [editing, setEditing] = useState<ContactRule | null | "new">(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact form rules</CardTitle>
        <CardDescription>Turn website inquiries into Lead tickets, based on what the visitor picked.</CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> Add rule
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {rules.length === 0 && <p className="text-sm text-muted-foreground">No rules: every inquiry becomes a default lead.</p>}
        {rules.map((r, i) => (
          <RuleRow
            key={r.id}
            table="contact"
            id={r.id}
            name={r.name}
            isActive={r.isActive}
            first={i === 0}
            last={i === rules.length - 1}
            onEdit={() => setEditing(r)}
            summary={`${r.conditions.length ? r.conditions.map((c) => `${c.key} = ${c.values.join(" / ")}`).join("; ") : "Everything"} · ${r.summary}`}
          />
        ))}
      </CardContent>
      {editing && <ContactRuleDialog rule={editing === "new" ? null : editing} types={types} priorities={priorities} people={people} onClose={() => setEditing(null)} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Portal request forms
// ---------------------------------------------------------------------------

type RequestForm = { id: string; name: string; isActive: boolean; ticketTypeId: string; fields: FormFieldInput[]; summary: string };
const KINDS: Opt[] = [
  { value: "short_text", label: "Short answer" },
  { value: "long_text", label: "Paragraph" },
  { value: "select", label: "Pick one" },
  { value: "multi_select", label: "Pick several" },
  { value: "file", label: "Files" },
  { value: "url", label: "Web address" },
  { value: "date", label: "Date" },
];

function RequestFormDialog({ form, types, onClose }: { form: RequestForm | null; types: Opt[]; onClose: () => void }) {
  const { pending, run } = useRun();
  const [name, setName] = useState(form?.name ?? "");
  const [typeId, setTypeId] = useState(form?.ticketTypeId ?? types[0]?.value ?? "");
  const [fields, setFields] = useState<FormFieldInput[]>(form?.fields ?? [{ key: "", label: "What do you need?", kind: "short_text", options: [], required: true }]);
  const update = (i: number, patch: Partial<FormFieldInput>) => setFields((s) => s.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, d: -1 | 1) =>
    setFields((s) => {
      const n = [...s];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{form ? `Edit ${form.name}` : "New request form"}</DialogTitle>
          <DialogDescription>The first short answer becomes the request&apos;s title. File fields upload onto the new ticket.</DialogDescription>
        </DialogHeader>
        <form
          id="request-form"
          className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveRequestForm(form?.id ?? null, { name, ticketTypeId: typeId, fields }), (r) => r.ok && onClose());
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="rf-name">Name</Label>
              <Input id="rf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Support request" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rf-type">Creates</Label>
              <Select id="rf-type" value={typeId} onChange={setTypeId} options={types} />
            </div>
          </div>
          {fields.map((f, i) => (
            <div key={i} className="grid gap-2 rounded-lg border p-3">
              <div className="flex items-center gap-1">
                <span className="flex-1 text-xs font-medium text-muted-foreground">Field {i + 1}</span>
                <Button type="button" size="icon-xs" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button type="button" size="icon-xs" variant="ghost" aria-label="Move down" disabled={i === fields.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown />
                </Button>
                <Button type="button" size="icon-xs" variant="ghost" aria-label={`Remove field ${i + 1}`} onClick={() => setFields((s) => s.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
                <Input aria-label={`Field ${i + 1} label`} value={f.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Question" />
                <Select id={`rf-kind-${i}`} value={f.kind} onChange={(x) => update(i, { kind: x as FormFieldInput["kind"] })} options={KINDS} />
              </div>
              {(f.kind === "select" || f.kind === "multi_select") && (
                <Textarea aria-label={`Field ${i + 1} options`} rows={3} value={f.options.join("\n")} onChange={(e) => update(i, { options: e.target.value.split("\n") })} placeholder={"Options, one per line"} />
              )}
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={f.required} onCheckedChange={(c) => update(i, { required: Boolean(c) })} /> Required
              </label>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => setFields((s) => [...s, { key: "", label: "", kind: "short_text", options: [], required: false }])}>
            <Plus /> Add field
          </Button>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="request-form" disabled={pending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RequestForms({ forms, types }: { forms: RequestForm[]; types: Opt[] }) {
  const [editing, setEditing] = useState<RequestForm | null | "new">(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Portal request forms</CardTitle>
        <CardDescription>What clients fill in under New request in the portal.</CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> Add form
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {forms.length === 0 && <p className="text-sm text-muted-foreground">No forms: clients can&apos;t send requests from the portal.</p>}
        {forms.map((f, i) => (
          <RuleRow key={f.id} table="forms" id={f.id} name={f.name} summary={f.summary} isActive={f.isActive} first={i === 0} last={i === forms.length - 1} onEdit={() => setEditing(f)} />
        ))}
      </CardContent>
      {editing && <RequestFormDialog form={editing === "new" ? null : editing} types={types} onClose={() => setEditing(null)} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Default assignees
// ---------------------------------------------------------------------------

type AssignRule = AssignInput & { id: string; isActive: boolean; summary: string };

function AssignDialog({ rule, lines, types, people, onClose }: { rule: AssignRule | null; lines: Opt[]; types: Opt[]; people: Opt[]; onClose: () => void }) {
  const { pending, run } = useRun();
  const [v, setV] = useState<AssignInput>(rule ?? { name: "", serviceLineId: "", ticketTypeId: "", strategy: "fixed", assigneeMembershipId: people[0]?.value ?? "", poolMembershipIds: [] });
  const set = <K extends keyof AssignInput>(k: K, value: AssignInput[K]) => setV((s) => ({ ...s, [k]: value }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{rule ? `Edit ${rule.name}` : "New default assignee"}</DialogTitle>
          <DialogDescription>Used for new leads, portal requests and project tickets. The most specific rule wins (service + type, then type, then service).</DialogDescription>
        </DialogHeader>
        <form
          id="assign-rule"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveAssignmentRule(rule?.id ?? null, v), (r) => r.ok && onClose());
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="ar-name">Name</Label>
            <Input id="ar-name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Web leads" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="ar-line">Service line</Label>
              <Select id="ar-line" value={v.serviceLineId} onChange={(x) => set("serviceLineId", x)} options={lines} empty="Any" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ar-type">Ticket type</Label>
              <Select id="ar-type" value={v.ticketTypeId} onChange={(x) => set("ticketTypeId", x)} options={types} empty="Any" />
            </div>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Who gets them</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="strategy" className="accent-primary" checked={v.strategy === "fixed"} onChange={() => set("strategy", "fixed")} /> Always the same person
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="strategy" className="accent-primary" checked={v.strategy === "round_robin"} onChange={() => set("strategy", "round_robin")} /> Take turns (round robin)
            </label>
          </fieldset>
          {v.strategy === "fixed" ? (
            <Select id="ar-who" value={v.assigneeMembershipId} onChange={(x) => set("assigneeMembershipId", x)} options={people} />
          ) : (
            <div className="grid max-h-48 gap-2 overflow-y-auto rounded-md border p-2">
              {people.map((p) => (
                <label key={p.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={v.poolMembershipIds.includes(p.value)}
                    onCheckedChange={(c) => set("poolMembershipIds", c ? [...v.poolMembershipIds, p.value] : v.poolMembershipIds.filter((x) => x !== p.value))}
                  />
                  {p.label}
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Project tickets only use &quot;same person&quot; rules; otherwise they go to whoever in the task&apos;s team role has the fewest open tickets.</p>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="assign-rule" disabled={pending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AssignmentRules({ rules, lines, types, people }: { rules: AssignRule[]; lines: Opt[]; types: Opt[]; people: Opt[] }) {
  const [editing, setEditing] = useState<AssignRule | null | "new">(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Default assignees</CardTitle>
        <CardDescription>Who new work goes to when nothing more specific says otherwise.</CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> Add
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {rules.length === 0 && <p className="text-sm text-muted-foreground">None. New work goes to the matching team role (Sales for leads, Support for requests).</p>}
        {rules.map((r, i) => (
          <RuleRow key={r.id} table="assign" id={r.id} name={r.name} summary={r.summary} isActive={r.isActive} first={i === 0} last={i === rules.length - 1} onEdit={() => setEditing(r)} />
        ))}
      </CardContent>
      {editing && <AssignDialog rule={editing === "new" ? null : editing} lines={lines} types={types} people={people} onClose={() => setEditing(null)} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Spam protection
// ---------------------------------------------------------------------------

export function SpamProtection({ perHour }: { perHour: number }) {
  const { pending, run } = useRun();
  const [n, setN] = useState(String(perHour));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Spam protection</CardTitle>
        <CardDescription>The website&apos;s hidden honeypot field always drops bots. This limits how many leads one visitor can create.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 text-sm">
        <Input aria-label="Leads per visitor per hour" type="number" min={1} max={100} value={n} onChange={(e) => setN(e.target.value)} className="w-24" />
        leads per visitor per hour
        <Button size="sm" variant="outline" disabled={pending || n === String(perHour)} onClick={() => run(() => saveSpam(Number(n)))}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
