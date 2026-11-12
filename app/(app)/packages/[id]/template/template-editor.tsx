"use client";
import { useEffect, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Clock, Copy, Eye, GripVertical, Link2, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  addPhase,
  addTask,
  deletePhase,
  deleteTask,
  reorderPhases,
  reorderTasks,
  startEditing,
} from "./actions";
import { ConfirmDelete, CopyFromDialog, PhaseDialog, TaskDialog } from "./template-dialogs";
import { GATE_LABELS, ROLE_LABELS, hours, useAction, type PhaseData, type TaskData } from "./template-shared";

export type { PhaseData, TaskData };

export function TemplateEditor(props: {
  packageId: string;
  packageKey: string;
  isDraft: boolean;
  versionLabel: string;
  defaultRevisionRounds: number;
  phases: PhaseData[];
  tasks: TaskData[];
  copySources: { id: string; label: string; phases: number }[];
}) {
  const { packageId, isDraft } = props;
  const [phases, setPhases] = useState(props.phases);
  const [tasks, setTasks] = useState(props.tasks);
  const [newPhase, setNewPhase] = useState("");
  const [copyOpen, setCopyOpen] = useState(false);
  const { pending, run } = useAction();

  // Server data wins after every save.
  useEffect(() => setPhases(props.phases), [props.phases]);
  useEffect(() => setTasks(props.tasks), [props.tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onPhaseDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = phases.findIndex((p) => p.id === active.id);
    const to = phases.findIndex((p) => p.id === over.id);
    const next = arrayMove(phases, from, to);
    setPhases(next);
    run(() => reorderPhases(packageId, next.map((p) => p.id)), (r) => r.error && setPhases(props.phases));
  }

  const totalMinutes = tasks.reduce((sum, t) => sum + (t.estimateMinutes ?? 0), 0);

  if (!isDraft) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Viewing the live template ({props.versionLabel})</p>
            <p className="text-sm text-muted-foreground">Start editing to make a draft. Projects keep using the live version until you publish.</p>
          </div>
          <Button disabled={pending} onClick={() => run(() => startEditing(packageId))}>
            <Pencil />
            Start editing
          </Button>
        </div>
        <TemplateSummary phases={phases.length} tasks={tasks.length} minutes={totalMinutes} />
        {phases.length === 0 && <EmptyState />}
        {phases.map((p) => (
          <PhaseCard key={p.id} {...{ phase: p, tasks: tasks.filter((t) => t.phaseId === p.id), allTasks: tasks, phases, packageId, readOnly: true, defaultRevisionRounds: props.defaultRevisionRounds, setTasks }} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TemplateSummary phases={phases.length} tasks={tasks.length} minutes={totalMinutes} />
        {props.copySources.length > 0 && (
          <Button variant="outline" onClick={() => setCopyOpen(true)}>
            <Copy />
            Copy from another package
          </Button>
        )}
      </div>

      {phases.length === 0 && <EmptyState />}

      <DndContext id="phases" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onPhaseDragEnd}>
        <SortableContext items={phases.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {phases.map((p) => (
              <SortablePhase key={p.id} id={p.id}>
                {(handle) => (
                  <PhaseCard
                    phase={p}
                    tasks={tasks.filter((t) => t.phaseId === p.id)}
                    allTasks={tasks}
                    phases={phases}
                    packageId={packageId}
                    readOnly={false}
                    defaultRevisionRounds={props.defaultRevisionRounds}
                    setTasks={setTasks}
                    handle={handle}
                  />
                )}
              </SortablePhase>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newPhase.trim()) return;
          run(() => addPhase(packageId, newPhase), (r) => r.ok && setNewPhase(""));
        }}
      >
        <Input value={newPhase} onChange={(e) => setNewPhase(e.target.value)} placeholder="New phase name, e.g. Discovery" className="max-w-sm" />
        <Button type="submit" variant="outline" disabled={pending || !newPhase.trim()}>
          <Plus />
          Add phase
        </Button>
      </form>

      <CopyFromDialog open={copyOpen} onOpenChange={setCopyOpen} packageId={packageId} sources={props.copySources} hasPhases={phases.length > 0} />
    </div>
  );
}

function TemplateSummary({ phases, tasks, minutes }: { phases: number; tasks: number; minutes: number }) {
  return (
    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
      <span>
        <span className="font-medium text-foreground">{phases}</span> phases
      </span>
      <span>
        <span className="font-medium text-foreground">{tasks}</span> tasks
      </span>
      <span>
        <span className="font-medium text-foreground">{hours(minutes)}</span> estimated hours
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      No phases yet. Add one below, or copy a template from another package.
    </div>
  );
}

type Handle = { ref: (el: HTMLElement | null) => void; props: Record<string, unknown> };

function SortablePhase({ id, children }: { id: string; children: (handle: Handle) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 opacity-80" : undefined}
    >
      {children({ ref: setActivatorNodeRef, props: { ...attributes, ...listeners } })}
    </div>
  );
}

function DragHandle({ handle, label }: { handle?: Handle; label: string }) {
  if (!handle) return null;
  return (
    <button
      type="button"
      ref={handle.ref}
      {...handle.props}
      aria-label={label}
      className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
    >
      <GripVertical className="size-4" />
    </button>
  );
}

function PhaseCard({
  phase,
  tasks,
  allTasks,
  phases,
  packageId,
  readOnly,
  defaultRevisionRounds,
  setTasks,
  handle,
}: {
  phase: PhaseData;
  tasks: TaskData[];
  allTasks: TaskData[];
  phases: PhaseData[];
  packageId: string;
  readOnly: boolean;
  defaultRevisionRounds: number;
  setTasks: React.Dispatch<React.SetStateAction<TaskData[]>>;
  handle?: Handle;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<TaskData | null>(null);
  const [newTask, setNewTask] = useState("");
  const { pending, run } = useAction();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const rounds = phase.revisionRounds ?? defaultRevisionRounds;
  const phaseMinutes = tasks.reduce((s, t) => s + (t.estimateMinutes ?? 0), 0);

  function onTaskDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = tasks.findIndex((t) => t.id === active.id);
    const to = tasks.findIndex((t) => t.id === over.id);
    const reordered = arrayMove(tasks, from, to);
    setTasks((all) => [...all.filter((t) => t.phaseId !== phase.id), ...reordered]);
    run(() => reorderTasks(packageId, phase.id, reordered.map((t) => t.id)));
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-2">
        <DragHandle handle={handle} label={`Reorder phase ${phase.name}`} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">P{phase.position}</span>
            <span className="font-semibold">{phase.name}</span>
            <Badge variant="outline">{GATE_LABELS[phase.gate]}</Badge>
            {phase.gate !== "none" && (
              <Badge variant="secondary">
                {rounds} revision round{rounds === 1 ? "" : "s"}
                {phase.revisionRounds === null ? " (default)" : ""}
              </Badge>
            )}
          </div>
          {phase.description && <p className="text-sm text-muted-foreground">{phase.description}</p>}
          <p className="text-xs text-muted-foreground">
            {tasks.length} task{tasks.length === 1 ? "" : "s"} · {hours(phaseMinutes)} h
          </p>
        </div>
        {!readOnly && (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Edit phase" onClick={() => setEditOpen(true)}>
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Delete phase" onClick={() => setDeleteOpen(true)}>
              <Trash2 />
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-2">
        {readOnly ? (
          tasks.map((t) => <TaskRow key={t.id} task={t} allTasks={allTasks} />)
        ) : (
          <DndContext id={`tasks-${phase.id}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onTaskDragEnd}>
            <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {tasks.map((t) => (
                <SortableTask key={t.id} id={t.id}>
                  {(h) => <TaskRow task={t} allTasks={allTasks} handle={h} onOpen={() => setEditing(t)} />}
                </SortableTask>
              ))}
            </SortableContext>
          </DndContext>
        )}

        {tasks.length === 0 && <p className="py-2 text-sm text-muted-foreground">No tasks in this phase yet.</p>}

        {!readOnly && (
          <form
            className="flex gap-2 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newTask.trim()) return;
              run(() => addTask(packageId, phase.id, newTask), (r) => r.ok && setNewTask(""));
            }}
          >
            <Input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a task" />
            <Button type="submit" variant="outline" size="icon" aria-label="Add task" disabled={pending || !newTask.trim()}>
              <Plus />
            </Button>
          </form>
        )}
      </CardContent>

      {!readOnly && (
        <>
          <PhaseDialog open={editOpen} onOpenChange={setEditOpen} packageId={packageId} phase={phase} defaultRevisionRounds={defaultRevisionRounds} />
          <ConfirmDelete
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title={`Delete phase "${phase.name}"?`}
            description={`Its ${tasks.length} task${tasks.length === 1 ? "" : "s"} will be deleted too. This only changes the draft.`}
            onConfirm={() => run(() => deletePhase(packageId, phase.id), () => setDeleteOpen(false))}
            pending={pending}
          />
          {editing && (
            <TaskDialog
              open
              onOpenChange={(o) => !o && setEditing(null)}
              packageId={packageId}
              task={editing}
              phases={phases}
              allTasks={allTasks}
              onDelete={() => run(() => deleteTask(packageId, editing.id), () => setEditing(null))}
            />
          )}
        </>
      )}
    </Card>
  );
}

function SortableTask({ id, children }: { id: string; children: (handle: Handle) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 opacity-80" : undefined}
    >
      {children({ ref: setActivatorNodeRef, props: { ...attributes, ...listeners } })}
    </div>
  );
}

function TaskRow({ task, allTasks, handle, onOpen }: { task: TaskData; allTasks: TaskData[]; handle?: Handle; onOpen?: () => void }) {
  const depCodes = task.dependsOn.map((id) => allTasks.find((t) => t.id === id)?.code).filter(Boolean);
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-black px-2 py-2">
      <DragHandle handle={handle} label={`Reorder task ${task.title}`} />
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left disabled:cursor-default"
      >
        <span className="font-mono text-xs text-muted-foreground">{task.code}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</span>
        <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{ROLE_LABELS[task.defaultRole] ?? task.defaultRole}</span>
          {task.estimateMinutes !== null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {hours(task.estimateMinutes)} h
            </span>
          )}
          {task.checklist.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <ListChecks className="size-3" />
              {task.checklist.length}
            </span>
          )}
          {depCodes.length > 0 && (
            <span className="inline-flex items-center gap-1" title="Waits for">
              <Link2 className="size-3" />
              {depCodes.join(", ")}
            </span>
          )}
          {task.isClientVisible && (
            <span className="inline-flex items-center gap-1" title="Client can see this task">
              <Eye className="size-3" />
              Client
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
