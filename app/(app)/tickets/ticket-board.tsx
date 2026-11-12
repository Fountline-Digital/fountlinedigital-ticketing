"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Eye, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { updateTicket } from "./actions";
import type { TicketRow } from "./query";

type Status = { value: string; label: string; color: string; category: string };

const dueFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function CardBody({ t, dragging }: { t: TicketRow; dragging?: boolean }) {
  const done = t.statusCategory === "done" || t.statusCategory === "cancelled";
  const due = t.dueAt ? new Date(t.dueAt) : null;
  const overdue = due && !done && due.getTime() < Date.now();
  return (
    <div className={cn("space-y-1.5 rounded-lg border bg-black p-3 text-sm", dragging && "shadow-lg ring-1 ring-primary")}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-3 w-1 rounded-sm" style={{ backgroundColor: t.priorityColor }} aria-label={`${t.priorityName} priority`} />
        <span className="font-mono">{t.key}</span>
        {t.isClientVisible && <Eye className="size-3" aria-label="Client can see" />}
        {due && <span className={cn("ml-auto", overdue && "font-medium text-destructive")}>{dueFmt.format(due)}</span>}
      </div>
      <Link href={`/tickets/${t.key}`} className="block font-medium leading-snug hover:underline">
        {t.title}
      </Link>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{t.projectKey ?? t.typeName}</span>
        <span className="truncate">{t.assigneeName || t.assigneeEmail || "Unassigned"}</span>
      </div>
    </div>
  );
}

function DraggableCard({ t }: { t: TicketRow }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: t.id });
  return (
    <div ref={setNodeRef} className={cn("group relative", isDragging && "opacity-30")}>
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Move ${t.key}`}
        className="absolute top-2 right-1.5 z-10 cursor-grab touch-none rounded p-0.5 text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground group-hover:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </button>
      <CardBody t={t} />
    </div>
  );
}

function Column({ status, tickets }: { status: Status; tickets: TicketRow[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.value });
  return (
    <section
      ref={setNodeRef}
      className={cn("flex w-72 shrink-0 flex-col gap-2 rounded-xl border bg-muted/40 p-2 transition-colors", isOver && "border-primary bg-muted")}
      aria-label={status.label}
    >
      <header className="flex items-center gap-2 px-1 py-1 text-sm font-medium">
        <span className="size-2 rounded-full" style={{ backgroundColor: status.color }} />
        {status.label}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{tickets.length}</span>
      </header>
      <div className="flex min-h-24 flex-col gap-2">
        {tickets.map((t) => (
          <DraggableCard key={t.id} t={t} />
        ))}
      </div>
    </section>
  );
}

export function TicketBoard({ statuses, tickets: initial }: { statuses: Status[]; tickets: TicketRow[] }) {
  const [tickets, setTickets] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, start] = useTransition();
  useEffect(() => setTickets(initial), [initial]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
  const active = tickets.find((t) => t.id === activeId) ?? null;

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const ticketId = String(e.active.id);
    const statusId = e.over ? String(e.over.id) : null;
    const t = tickets.find((x) => x.id === ticketId);
    if (!t || !statusId || statusId === t.statusId) return;
    const status = statuses.find((s) => s.value === statusId);
    if (!status) return;

    const before = tickets;
    setTickets((all) =>
      all.map((x) =>
        x.id === ticketId ? { ...x, statusId, statusName: status.label, statusColor: status.color, statusCategory: status.category as TicketRow["statusCategory"] } : x,
      ),
    );
    start(async () => {
      const r = await updateTicket(ticketId, { statusId });
      if (r.error) {
        toast.error(r.error);
        setTickets(before);
      } else if (r.ok && r.ok !== "Saved.") {
        toast.success(r.ok); // e.g. a phase moved forward
      }
    });
  }

  return (
    <DndContext
      id="ticket-board"
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={onDragEnd}
    >
      <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
        <div className="flex gap-3">
          {statuses.map((s) => (
            <Column key={s.value} status={s} tickets={tickets.filter((t) => t.statusId === s.value)} />
          ))}
        </div>
      </div>
      <DragOverlay>{active ? <CardBody t={active} dragging /> : null}</DragOverlay>
      <p className="text-xs text-muted-foreground">Done and cancelled tickets show for 14 days after they close.</p>
    </DndContext>
  );
}
