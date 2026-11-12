import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ProgressBar } from "../projects/progress-bar";
import { TicketStatus } from "../projects/status-badge";

const dueFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function StatTile({ label, value, href, hint, alert }: { label: string; value: number; href: string; hint?: string; alert?: boolean }) {
  const showAlert = alert && value > 0;
  return (
    <Link href={href} className="group">
      <Card className="h-full transition-colors group-hover:border-primary">
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5">
            {showAlert && <AlertTriangle className="size-3.5 text-destructive" aria-hidden />}
            {label}
          </CardDescription>
          <CardTitle className={cn("text-3xl tabular-nums", showAlert && "text-destructive")}>{value}</CardTitle>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </CardHeader>
      </Card>
    </Link>
  );
}

type ListTicket = { id: string; key: string; title: string; dueAt: Date | null; statusName: string; statusColor: string; projectKey: string | null };

export function TicketListCard({
  title,
  description,
  tickets,
  href,
  empty,
}: {
  title: string;
  description?: string;
  tickets: ListTicket[];
  href?: string;
  empty: string;
}) {
  const now = Date.now();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {href && (
          <CardAction>
            <Link href={href} className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
              All <ChevronRight className="size-3.5" />
            </Link>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y">
            {tickets.map((t) => {
              const overdue = t.dueAt && t.dueAt.getTime() < now;
              return (
                <li key={t.id}>
                  <Link href={`/tickets/${t.key}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 hover:bg-muted/50">
                    <span className="font-mono text-xs text-muted-foreground">{t.key}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                    {t.dueAt && (
                      <span className={cn("text-xs", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                        {overdue ? "Overdue · " : "Due "}
                        {dueFmt.format(t.dueAt)}
                      </span>
                    )}
                    <TicketStatus name={t.statusName} color={t.statusColor} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function MyTicketsCard({ tickets, title = "My tickets" }: { tickets: ListTicket[]; title?: string }) {
  return (
    <TicketListCard
      title={title}
      description="Open and assigned to you, soonest due first."
      tickets={tickets}
      href="/tickets?assignee=me&sort=due"
      empty="Nothing assigned to you. Nice."
    />
  );
}

export function LaunchesCard({
  launches,
}: {
  launches: { id: string; key: string; name: string; clientName: string; targetLaunchDate: string | null }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming launches</CardTitle>
        <CardDescription>Next 30 days, with this team&apos;s work on them.</CardDescription>
      </CardHeader>
      <CardContent>
        {launches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No launches in the next 30 days.</p>
        ) : (
          <ul className="divide-y">
            {launches.map((l) => (
              <li key={l.id}>
                <Link href={`/projects/${l.id}`} className="flex items-center gap-3 py-2 text-sm hover:bg-muted/50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{l.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {l.key} · {l.clientName}
                    </span>
                  </span>
                  {l.targetLaunchDate && (
                    <span className="text-xs text-muted-foreground">{dateFmt.format(new Date(`${l.targetLaunchDate}T00:00:00Z`))}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function PipelineCard({
  stages,
  followUps,
}: {
  stages: { id: string; name: string; kind: string; n: number }[];
  followUps: ListTicket[];
}) {
  const max = Math.max(1, ...stages.map((s) => s.n));
  const total = stages.reduce((sum, s) => sum + s.n, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead pipeline</CardTitle>
        <CardDescription>{total === 0 ? "Leads show here once the website contact form is connected." : `${total} leads`}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {stages.map((s) => (
            <li key={s.id} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-3 text-sm" title={`${s.name}: ${s.n}`}>
              <span className={cn("truncate", s.kind !== "open" && "text-muted-foreground")}>{s.name}</span>
              <span className="h-2 overflow-hidden rounded-full bg-muted">
                <span className={cn("block h-full rounded-full", s.kind === "open" ? "bg-primary" : "bg-muted-foreground")} style={{ width: `${(s.n / max) * 100}%` }} />
              </span>
              <span className="text-right tabular-nums text-muted-foreground">{s.n}</span>
            </li>
          ))}
        </ul>
        {followUps.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Follow-ups due</p>
            {followUps.map((t) => (
              <Link key={t.id} href={`/tickets/${t.key}`} className="flex gap-2 py-1 text-sm hover:underline">
                <span className="font-mono text-xs text-muted-foreground">{t.key}</span>
                <span className="truncate">{t.title}</span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ResponseTargetsCard({ tickets }: { tickets: (ListTicket & { responseDueAt: Date | null })[] }) {
  const now = Date.now();
  const left = (d: Date) => {
    const mins = Math.round((d.getTime() - now) / 60000);
    if (mins < 0) return { text: `${Math.round(-mins / 60)}h over`, late: true };
    if (mins < 60) return { text: `${mins}m left`, late: false };
    return { text: `${Math.round(mins / 60)}h left`, late: false };
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Response targets</CardTitle>
        <CardDescription>Support requests waiting for a first reply.</CardDescription>
      </CardHeader>
      <CardContent>
        {tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No support requests waiting.</p>
        ) : (
          <ul className="divide-y">
            {tickets.map((t) => {
              const target = t.responseDueAt ?? t.dueAt;
              const l = target ? left(target) : null;
              return (
                <li key={t.id}>
                  <Link href={`/tickets/${t.key}`} className="flex items-center gap-3 py-2 text-sm hover:bg-muted/50">
                    <span className="font-mono text-xs text-muted-foreground">{t.key}</span>
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    {l && <span className={cn("text-xs", l.late ? "font-medium text-destructive" : "text-muted-foreground")}>{l.text}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

type ProjectSummary = {
  id: string;
  key: string;
  name: string;
  clientName: string;
  targetLaunchDate: string | null;
  phase: { label: string; awaiting: boolean } | null;
  done: number;
  total: number;
};

export function ProjectsCard({ projects, title = "Active projects" }: { projects: ProjectSummary[]; title?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Soonest target launch first.</CardDescription>
        <CardAction>
          <Link href="/projects" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
            All <ChevronRight className="size-3.5" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active projects.</p>
        ) : (
          <ul className="divide-y">
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="grid gap-1.5 py-2.5 hover:bg-muted/50 sm:grid-cols-[1fr_10rem] sm:items-center sm:gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="font-mono">{p.key}</span>
                      <span>{p.clientName}</span>
                      {p.phase && <span>{p.phase.label}</span>}
                      {p.phase?.awaiting && <Badge variant="secondary">Awaiting sign-off</Badge>}
                      {p.targetLaunchDate && <span>Launch {dateFmt.format(new Date(`${p.targetLaunchDate}T00:00:00Z`))}</span>}
                    </div>
                  </div>
                  <ProgressBar done={p.done} total={p.total} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

type Approval = { id: string; position: number; name: string; gate: string; projectId: string; projectKey: string; projectName: string; clientName: string };

export function ApprovalsCard({ approvals }: { approvals: Approval[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Waiting for sign-off</CardTitle>
        <CardDescription>Phases where all the work is done.</CardDescription>
      </CardHeader>
      <CardContent>
        {approvals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing waiting.</p>
        ) : (
          <ul className="divide-y">
            {approvals.map((a) => (
              <li key={a.id}>
                <Link href={`/projects/${a.projectId}`} className="block py-2 hover:bg-muted/50">
                  <div className="text-sm font-medium">
                    P{a.position} · {a.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {a.projectKey} · {a.clientName} · {{ manager: "manager", client: "client", both: "manager + client" }[a.gate] ?? a.gate} signs off
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function WorkloadCard({
  people,
  unassigned,
  title = "Workload",
  linkSuffix = "",
}: {
  people: { id: string; name: string; open: number }[];
  unassigned: number;
  title?: string;
  linkSuffix?: string;
}) {
  const rows = [...people, ...(unassigned > 0 ? [{ id: "none", name: "Unassigned", open: unassigned }] : [])];
  const max = Math.max(1, ...rows.map((r) => r.open));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Open tickets per person.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No team members yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/tickets?assignee=${r.id}${linkSuffix}`}
                  className="grid grid-cols-[7rem_1fr_2rem] items-center gap-3 rounded text-sm hover:bg-muted/50"
                  title={`${r.name}: ${r.open} open ticket${r.open === 1 ? "" : "s"}`}
                >
                  <span className={cn("truncate", r.id === "none" && "text-muted-foreground")}>{r.name}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn("block h-full rounded-full", r.id === "none" ? "bg-muted-foreground" : "bg-primary")}
                      style={{ width: `${(r.open / max) * 100}%` }}
                    />
                  </span>
                  <span className="text-right tabular-nums text-muted-foreground">{r.open}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
