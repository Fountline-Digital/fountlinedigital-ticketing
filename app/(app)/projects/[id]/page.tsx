import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { ArrowLeft, CalendarDays, Eye, Lock } from "lucide-react";
import { db } from "@/db";
import {
  clients,
  memberships,
  organizations,
  packageVersions,
  packages,
  projectMembers,
  projectPhases,
  projects,
  ticketLinks,
  ticketStatuses,
  ticketTypes,
  tickets,
  users,
} from "@/db/schema";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can, ROLE_LABELS, type Role } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { ProgressBar } from "../progress-bar";
import { PhaseStatusBadge, ProjectStatusBadge, TicketStatus } from "../status-badge";
import { NewTicketDialog } from "../../tickets/new-ticket-dialog";
import { TeamCard } from "./team-card";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const { membership } = await requireUser();
  const orgId = membership.orgId;
  const role = membership.role as Role;

  const [row] = await db
    .select({ p: projects, client: clients, packageKey: packages.key, packageName: packages.name, version: packageVersions.version })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .innerJoin(packageVersions, eq(packageVersions.id, projects.packageVersionId))
    .innerJoin(packages, eq(packages.id, packageVersions.packageId))
    .where(and(eq(projects.id, id), eq(projects.orgId, orgId), isNull(projects.deletedAt)));
  if (!row) notFound();
  const { p } = row;

  const members = await db
    .select({ membershipId: memberships.id, role: memberships.role, name: users.name, email: users.email })
    .from(projectMembers)
    .innerJoin(memberships, eq(memberships.id, projectMembers.membershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(projectMembers.projectId, p.id));

  // Workers and contractors only see projects they're on.
  if (!(await can(orgId, role, "projects.view_all")) && !members.some((m) => m.membershipId === membership.id)) notFound();
  const canManage = await can(orgId, role, "projects.manage");
  const canSeeClient = await can(orgId, role, "clients.view");

  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
  const showDate = (d: string | null) => (d ? dateFmt.format(new Date(`${d}T00:00:00Z`)) : "Not set");

  const types = await db
    .select()
    .from(ticketTypes)
    .where(and(eq(ticketTypes.orgId, orgId), eq(ticketTypes.isActive, true), ne(ticketTypes.kind, "lead")))
    .orderBy(asc(ticketTypes.sortOrder));
  const phases = await db.select().from(projectPhases).where(eq(projectPhases.projectId, p.id)).orderBy(asc(projectPhases.position));
  const ticketRows = await db
    .select({
      t: tickets,
      statusName: ticketStatuses.name,
      statusColor: ticketStatuses.color,
      statusCategory: ticketStatuses.category,
      assigneeName: users.name,
      assigneeEmail: users.email,
    })
    .from(tickets)
    .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
    .leftJoin(memberships, eq(memberships.id, tickets.assigneeMembershipId))
    .leftJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(tickets.projectId, p.id), isNull(tickets.deletedAt)))
    .orderBy(asc(tickets.number));

  // "Waiting on" = an unfinished ticket that blocks this one
  const ids = ticketRows.map((r) => r.t.id);
  const blocks = ids.length
    ? await db.select().from(ticketLinks).where(and(inArray(ticketLinks.toTicketId, ids), eq(ticketLinks.kind, "blocks")))
    : [];
  const byId = new Map(ticketRows.map((r) => [r.t.id, r] as const));
  const waitingOn = (ticketId: string) =>
    blocks
      .filter((b) => b.toTicketId === ticketId)
      .map((b) => byId.get(b.fromTicketId))
      .filter((r) => r && r.statusCategory !== "done" && r.statusCategory !== "cancelled")
      .map((r) => r!.t.key);

  const counted = ticketRows.filter((r) => r.statusCategory !== "cancelled");
  const done = counted.filter((r) => r.statusCategory === "done").length;

  // Team members who can be added (not clients, not already on it)
  const addable = canManage
    ? (
        await db
          .select({ membershipId: memberships.id, role: memberships.role, name: users.name, email: users.email })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(and(eq(memberships.orgId, orgId), eq(memberships.status, "active")))
      ).filter((m) => m.role !== "client" && !members.some((x) => x.membershipId === m.membershipId))
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Projects
      </Link>

      {created && (
        <p className="rounded-lg border border-primary/50 bg-muted p-3 text-sm">
          Project created from {row.packageKey}-v{row.version} with {ticketRows.length} tickets. Phase 1 is active.
        </p>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
          <ProjectStatusBadge status={p.status} />
          <div className="ml-auto">
            <NewTicketDialog
              projectId={p.id}
              types={types.map((ty) => ({ value: ty.id, label: ty.name }))}
              defaultTypeId={types.find((ty) => ty.kind === "project_task")?.id}
              phases={phases.map((ph) => ({ value: ph.id, label: `P${ph.position} · ${ph.name}` }))}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="font-mono">{p.key}</span>
          {canSeeClient ? (
            <Link href={`/clients/${row.client.id}`} className="hover:text-foreground">
              {row.client.name}
            </Link>
          ) : (
            <span>{row.client.name}</span>
          )}
          <span>
            {row.packageName} <span className="font-mono">({row.packageKey}-v{row.version})</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" />
            {showDate(p.startDate)} → {showDate(p.targetLaunchDate)}
          </span>
        </div>
        <div className="max-w-md pt-1">
          <ProgressBar done={done} total={counted.length} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          {phases.map((ph) => {
            const phaseTickets = ticketRows.filter((r) => r.t.projectPhaseId === ph.id);
            const phaseCounted = phaseTickets.filter((r) => r.statusCategory !== "cancelled");
            const phaseDone = phaseCounted.filter((r) => r.statusCategory === "done").length;
            return (
              <Card key={ph.id} className={ph.status === "locked" ? "opacity-70" : undefined}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">P{ph.position}</span>
                    {ph.name}
                    <PhaseStatusBadge status={ph.status} />
                  </CardTitle>
                  <CardDescription>
                    {ph.gateApprover === "none"
                      ? "No sign-off needed"
                      : `Sign-off: ${{ manager: "manager", client: "client", both: "manager + client" }[ph.gateApprover]} · revisions ${ph.revisionRoundsUsed}/${ph.revisionRoundsAllowed}`}
                  </CardDescription>
                  <CardAction className="w-32">
                    <ProgressBar done={phaseDone} total={phaseCounted.length} />
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {phaseTickets.length === 0 && <p className="text-sm text-muted-foreground">No tickets in this phase.</p>}
                  {phaseTickets.map(({ t, statusName, statusColor, assigneeName, assigneeEmail }) => {
                    const waits = waitingOn(t.id);
                    return (
                      <Link
                        key={t.id}
                        href={`/tickets/${t.key}`}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 transition-colors hover:bg-muted"
                      >
                        <span className="font-mono text-xs text-muted-foreground">{t.key}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                        {t.isClientVisible && <Eye className="size-3.5 text-muted-foreground" aria-label="Client can see this" />}
                        {waits.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Lock className="size-3" />
                            Waiting on {waits.join(", ")}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">{assigneeName || assigneeEmail || "Unassigned"}</span>
                        <TicketStatus name={statusName} color={statusColor} />
                      </Link>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
          {phases.length === 0 && <p className="text-sm text-muted-foreground">This package version had no phases.</p>}
        </div>

        <TeamCard
          projectId={p.id}
          canManage={canManage}
          members={members.map((m) => ({ id: m.membershipId, label: m.name || m.email, role: ROLE_LABELS[m.role as Role] }))}
          addable={addable.map((m) => ({ value: m.membershipId, label: `${m.name || m.email} (${ROLE_LABELS[m.role as Role]})` }))}
          timezone={org.timezone}
        />
      </div>
    </div>
  );
}
