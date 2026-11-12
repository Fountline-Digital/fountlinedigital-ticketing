import { Badge } from "@/components/ui/badge";

const PROJECT: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  active: { label: "Active", variant: "default" },
  on_hold: { label: "On hold", variant: "outline" },
  completed: { label: "Completed", variant: "secondary" },
  archived: { label: "Archived", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

export function ProjectStatusBadge({ status }: { status: string }) {
  const s = PROJECT[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

const PHASE: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  active: { label: "Active", variant: "default" },
  awaiting_approval: { label: "Awaiting approval", variant: "secondary" },
  complete: { label: "Complete", variant: "secondary" },
  locked: { label: "Locked", variant: "outline" },
};

export function PhaseStatusBadge({ status }: { status: string }) {
  const s = PHASE[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

/** Ticket status with the admin-chosen color as a dot. */
export function TicketStatus({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}
