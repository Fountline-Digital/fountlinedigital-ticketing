"use client";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { replaceWithTemplateFrom, updatePhase, updateTask } from "./actions";
import { GATE_LABELS, hours, useAction, type PhaseData, type TaskData, type TeamRoleOption } from "./template-shared";

const GATE_ITEMS = (Object.keys(GATE_LABELS) as PhaseData["gate"][]).map((g) => ({ value: g, label: GATE_LABELS[g] }));
const NO_ROLE = "__none";

export function ConfirmDelete(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={props.pending} onClick={props.onConfirm}>
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function PhaseDialog({
  open,
  onOpenChange,
  packageId,
  phase,
  defaultRevisionRounds,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  packageId: string;
  phase: PhaseData;
  defaultRevisionRounds: number;
}) {
  const { pending, run } = useAction();
  const [name, setName] = useState(phase.name);
  const [description, setDescription] = useState(phase.description);
  const [gate, setGate] = useState<string>(phase.gate);
  const [rounds, setRounds] = useState(phase.revisionRounds === null ? "" : String(phase.revisionRounds));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit phase P{phase.position}</DialogTitle>
          <DialogDescription>Changes are saved to the draft.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="phase-name">Name</Label>
            <Input id="phase-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phase-desc">Description</Label>
            <Textarea id="phase-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid gap-2">
            <Label>Phase gate</Label>
            <Select items={GATE_ITEMS} value={gate} onValueChange={(v) => setGate(String(v ?? "none"))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GATE_ITEMS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Who signs off before the next phase unlocks.</p>
          </div>
          {gate !== "none" && (
            <div className="grid gap-2">
              <Label htmlFor="phase-rounds">Revision rounds</Label>
              <Input
                id="phase-rounds"
                type="number"
                min="0"
                max="20"
                value={rounds}
                onChange={(e) => setRounds(e.target.value)}
                placeholder={`Package default (${defaultRevisionRounds})`}
                className="max-w-48"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              run(
                () => updatePhase(packageId, phase.id, { name, description, gate, revisionRounds: rounds }),
                (r) => r.ok && onOpenChange(false),
              )
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            Save phase
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TaskDialog({
  open,
  onOpenChange,
  packageId,
  task,
  phases,
  allTasks,
  teamRoles,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  packageId: string;
  task: TaskData;
  phases: PhaseData[];
  allTasks: TaskData[];
  teamRoles: TeamRoleOption[];
  onDelete: () => void;
}) {
  const { pending, run } = useAction();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [phaseId, setPhaseId] = useState(task.phaseId);
  const [role, setRole] = useState(task.teamRoleId ?? NO_ROLE);
  const roleItems = [{ value: NO_ROLE, label: "No team role" }, ...teamRoles];
  const [estimate, setEstimate] = useState(task.estimateMinutes === null ? "" : String(hours(task.estimateMinutes)));
  const [clientVisible, setClientVisible] = useState(task.isClientVisible);
  const [checklist, setChecklist] = useState(task.checklist.join("\n"));
  const [dependsOn, setDependsOn] = useState<string[]>(task.dependsOn);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const phaseItems = phases.map((p) => ({ value: p.id, label: `P${p.position} · ${p.name}` }));
  const toggleDep = (id: string, on: boolean) => setDependsOn((d) => (on ? [...d, id] : d.filter((x) => x !== id)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <span className="mr-2 font-mono text-sm text-muted-foreground">{task.code}</span>
            Edit task
          </DialogTitle>
          <DialogDescription>Becomes a ticket in every new project that uses this package.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="task-title">Title</Label>
            <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-desc">Description</Label>
            <Textarea id="task-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What needs to be done and what 'done' looks like" />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Phase</Label>
              <Select items={phaseItems} value={phaseId} onValueChange={(v) => setPhaseId(String(v ?? task.phaseId))}>
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
              <Select items={roleItems} value={role} onValueChange={(v) => setRole(String(v ?? NO_ROLE))}>
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
            <div className="grid gap-2">
              <Label htmlFor="task-est">Estimate (hours)</Label>
              <Input id="task-est" type="number" min="0" step="0.25" value={estimate} onChange={(e) => setEstimate(e.target.value)} />
            </div>
          </div>

          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={clientVisible} onCheckedChange={(c) => setClientVisible(Boolean(c))} className="mt-0.5" />
            <span>
              <span className="font-medium">Client can see this task</span>
              <span className="block text-muted-foreground">Shows in their portal with its status. Internal notes stay hidden.</span>
            </span>
          </label>

          <div className="grid gap-2">
            <Label htmlFor="task-checklist">Checklist</Label>
            <Textarea id="task-checklist" value={checklist} onChange={(e) => setChecklist(e.target.value)} rows={4} placeholder="One step per line" />
          </div>

          <div className="grid gap-2">
            <Label>Can&apos;t start until these are done</Label>
            <div className="max-h-56 space-y-3 overflow-y-auto rounded-lg border p-3">
              {phases.map((p) => {
                const options = allTasks.filter((t) => t.phaseId === p.id && t.id !== task.id);
                if (options.length === 0) return null;
                return (
                  <div key={p.id} className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      P{p.position} · {p.name}
                    </p>
                    {options.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={dependsOn.includes(t.id)} onCheckedChange={(c) => toggleDep(t.id, Boolean(c))} />
                        <span className="font-mono text-xs text-muted-foreground">{t.code}</span>
                        {t.title}
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="destructive" onClick={() => setConfirmDelete(true)} disabled={pending}>
            <Trash2 />
            Delete task
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  updateTask(packageId, task.id, {
                    title,
                    description,
                    phaseId,
                    teamRoleId: role === NO_ROLE ? null : role,
                    estimateHours: estimate,
                    isClientVisible: clientVisible,
                    checklist,
                    dependsOn,
                  }),
                (r) => r.ok && onOpenChange(false),
              )
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            Save task
          </Button>
        </DialogFooter>

        <ConfirmDelete
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete "${task.title}"?`}
          description="Other tasks that wait on it will no longer wait. This only changes the draft."
          onConfirm={onDelete}
          pending={pending}
        />
      </DialogContent>
    </Dialog>
  );
}

export function CopyFromDialog({
  open,
  onOpenChange,
  packageId,
  sources,
  hasPhases,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  packageId: string;
  sources: { id: string; label: string; phases: number }[];
  hasPhases: boolean;
}) {
  const { pending, run } = useAction();
  const [source, setSource] = useState("");
  const items = sources.map((s) => ({ value: s.id, label: `${s.label}, ${s.phases} phases` }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copy template from another package</DialogTitle>
          <DialogDescription>
            {hasPhases
              ? "This replaces every phase and task in this draft with a copy of the other package's live template."
              : "Copies the other package's live template into this draft. You can edit it after."}
          </DialogDescription>
        </DialogHeader>
        <Select items={items} value={source} onValueChange={(v) => setSource(String(v ?? ""))}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a package" />
          </SelectTrigger>
          <SelectContent>
            {items.map((i) => (
              <SelectItem key={i.value} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button
            variant={hasPhases ? "destructive" : "default"}
            disabled={pending || !source}
            onClick={() => run(() => replaceWithTemplateFrom(packageId, source), (r) => r.ok && onOpenChange(false))}
          >
            {pending && <Loader2 className="animate-spin" />}
            {hasPhases ? "Replace template" : "Copy template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
