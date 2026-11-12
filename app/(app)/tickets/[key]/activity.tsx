export type ActivityItem = {
  id: string;
  who: string;
  action: string;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  when: string;
};

const FIELD_LABELS: Record<string, string> = {
  title: "title",
  description: "description",
  status: "status",
  priority: "priority",
  assignee: "assignee",
  due: "due date",
  estimate: "estimate",
  clientVisible: "client visibility",
  teamRole: "team role",
};

function describe(item: ActivityItem, memberName: Record<string, string>): string {
  const meta = item.metadata ?? {};
  const after = item.after ?? {};
  switch (item.action) {
    case "ticket.create":
      return "created the ticket";
    case "ticket.update": {
      const parts = Object.entries(after).map(([field, value]) => {
        const label = FIELD_LABELS[field] ?? field;
        if (field === "status" || field === "priority") return `set ${label} to ${String(value)}`;
        if (field === "assignee") return value === "Unassigned" ? "unassigned it" : `assigned it to ${memberName[String(value)] ?? String(value)}`;
        if (field === "teamRole") return value === "None" ? "removed the team role" : `moved it to the ${String(value)} team`;
        if (field === "clientVisible") return value ? "made it visible to the client" : "hid it from the client";
        if (field === "due") return value ? `set the due date to ${String(value)}` : "cleared the due date";
        if (field === "estimate") return value === null ? "cleared the estimate" : `set the estimate to ${Math.round((Number(value) / 60) * 100) / 100} h`;
        return `changed the ${label}`;
      });
      return parts.length ? parts.join(", ") : "updated the ticket";
    }
    case "ticket.checklist_add":
      return `added checklist item "${String(meta.label ?? "")}"`;
    case "ticket.checklist_done":
      return `checked off "${String(meta.label ?? "")}"`;
    case "ticket.checklist_undone":
      return `unchecked "${String(meta.label ?? "")}"`;
    case "ticket.checklist_remove":
      return `removed checklist item "${String(meta.label ?? "")}"`;
    case "ticket.comment":
      return meta.visibility === "client" ? "posted a client-visible comment" : "posted an internal comment";
    case "ticket.comment_delete":
      return "deleted a comment";
    case "ticket.link_add":
      return `linked ${String(meta.other ?? "")}`;
    case "ticket.link_remove":
      return "removed a link";
    case "ticket.delete":
      return "deleted the ticket";
    default:
      return item.action.replace(/^ticket\./, "").replaceAll("_", " ");
  }
}

export function ActivityList({ items, memberName }: { items: ActivityItem[]; memberName: Record<string, string> }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  return (
    <ol className="space-y-3 border-l pl-4">
      {items.map((i) => (
        <li key={i.id} className="relative text-sm">
          <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary" />
          <span className="font-medium">{i.who}</span> {describe(i, memberName)}
          <div className="text-xs text-muted-foreground">{i.when}</div>
        </li>
      ))}
    </ol>
  );
}
