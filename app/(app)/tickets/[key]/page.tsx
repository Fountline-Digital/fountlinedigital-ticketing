import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import {
  auditLog,
  clients,
  comments,
  memberships,
  organizations,
  priorities,
  projectPhases,
  projects,
  ticketChecklistItems,
  ticketLinks,
  ticketStatuses,
  ticketTypes,
  tickets,
  users,
} from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/session";
import { ticketAccess } from "@/lib/tickets";
import { ActivityList, type ActivityItem } from "./activity";
import { Checklist } from "./checklist";
import { Comments } from "./comments";
import { LinksCard } from "./links";
import { TicketFields, TicketHeaderEditor } from "./ticket-fields";

export default async function TicketPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const u = await requireUser();
  const ctx = { ...u, orgId: u.membership.orgId, role: u.membership.role as "admin" | "manager" | "worker" | "contractor" | "client" };
  const access = await ticketAccess(ctx, { key: decodeURIComponent(key).toUpperCase() });
  if (!access) notFound();
  const t = access.ticket;

  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  const tz = org.timezone;
  const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: tz });

  const [type] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, t.ticketTypeId));
  const statusRows = await db
    .select()
    .from(ticketStatuses)
    .where(and(eq(ticketStatuses.orgId, ctx.orgId), or(eq(ticketStatuses.isActive, true), eq(ticketStatuses.id, t.statusId))))
    .orderBy(asc(ticketStatuses.sortOrder));
  const priorityRows = await db
    .select()
    .from(priorities)
    .where(and(eq(priorities.orgId, ctx.orgId), or(eq(priorities.isActive, true), eq(priorities.id, t.priorityId))))
    .orderBy(asc(priorities.sortOrder));

  const team = await db
    .select({ membershipId: memberships.id, userId: users.id, name: users.name, email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.status, "active"), ne(memberships.role, "client")))
    .orderBy(asc(users.name));

  const [project] = t.projectId ? await db.select().from(projects).where(eq(projects.id, t.projectId)) : [];
  const [phase] = t.projectPhaseId ? await db.select().from(projectPhases).where(eq(projectPhases.id, t.projectPhaseId)) : [];
  const [client] = t.clientId ? await db.select().from(clients).where(eq(clients.id, t.clientId)) : [];
  const [reporter] = t.reporterUserId ? await db.select().from(users).where(eq(users.id, t.reporterUserId)) : [];

  const checklist = await db
    .select({ item: ticketChecklistItems, doneByName: users.name })
    .from(ticketChecklistItems)
    .leftJoin(users, eq(users.id, ticketChecklistItems.doneByUserId))
    .where(eq(ticketChecklistItems.ticketId, t.id))
    .orderBy(asc(ticketChecklistItems.position));

  // Links in both directions, with the other ticket's key/title/status
  const linkRows = await db
    .select()
    .from(ticketLinks)
    .where(or(eq(ticketLinks.fromTicketId, t.id), eq(ticketLinks.toTicketId, t.id)));
  const otherIds = linkRows.map((l) => (l.fromTicketId === t.id ? l.toTicketId : l.fromTicketId));
  const others = otherIds.length
    ? await db
        .select({ id: tickets.id, key: tickets.key, title: tickets.title, statusName: ticketStatuses.name, category: ticketStatuses.category })
        .from(tickets)
        .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
        .where(and(inArray(tickets.id, otherIds), isNull(tickets.deletedAt)))
    : [];
  const links = linkRows
    .map((l) => {
      const outgoing = l.fromTicketId === t.id;
      const other = others.find((o) => o.id === (outgoing ? l.toTicketId : l.fromTicketId));
      if (!other) return null;
      const relation =
        l.kind === "blocks" ? (outgoing ? "Blocks" : "Waiting on") : l.kind === "duplicate_of" ? (outgoing ? "Duplicate of" : "Duplicated by") : "Related to";
      return { id: l.id, relation, key: other.key, title: other.title, status: other.statusName, done: other.category === "done" || other.category === "cancelled" };
    })
    .filter((l) => l !== null);

  const commentRows = await db
    .select({ c: comments, name: users.name, email: users.email })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorUserId))
    .where(and(eq(comments.ticketId, t.id), isNull(comments.deletedAt)))
    .orderBy(asc(comments.createdAt));

  const activityRows = await db
    .select({ a: auditLog, name: users.name, email: users.email })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(and(eq(auditLog.entityType, "ticket"), eq(auditLog.entityId, t.id)))
    .orderBy(desc(auditLog.createdAt))
    .limit(100);
  const activity: ActivityItem[] = activityRows.map(({ a, name, email }) => ({
    id: a.id,
    who: name || email || "System",
    action: a.action,
    after: (a.changes?.after ?? null) as Record<string, unknown> | null,
    metadata: (a.metadata ?? null) as Record<string, unknown> | null,
    when: fmt.format(a.createdAt),
  }));
  const memberName = new Map(team.map((m) => [m.membershipId, m.name || m.email] as const));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {project ? (
        <Link href={`/projects/${project.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> {project.name}
        </Link>
      ) : (
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Dashboard
        </Link>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono">{t.key}</span>
              <Badge variant="outline">{type?.name}</Badge>
              {phase && (
                <span>
                  P{phase.position} · {phase.name}
                </span>
              )}
            </div>
            <TicketHeaderEditor ticketId={t.id} title={t.title} description={t.description ?? ""} />
          </div>

          <Checklist
            ticketId={t.id}
            items={checklist.map(({ item, doneByName }) => ({
              id: item.id,
              label: item.label,
              done: Boolean(item.doneAt),
              doneBy: doneByName ?? null,
            }))}
          />

          <Comments
            ticketId={t.id}
            ticketClientVisible={t.isClientVisible}
            currentUserId={ctx.user.id}
            canModerate={access.canDelete}
            mentionable={team.filter((m) => m.userId !== ctx.user.id).map((m) => ({ userId: m.userId, name: m.name || m.email }))}
            comments={commentRows.map(({ c, name, email }) => ({
              id: c.id,
              authorId: c.authorUserId,
              author: name || email || "Deleted user",
              body: c.body,
              visibility: c.visibility,
              when: fmt.format(c.createdAt),
            }))}
          />

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
              <CardDescription>Every change to this ticket.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityList items={activity} memberName={Object.fromEntries(memberName)} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <TicketFields
            ticketId={t.id}
            canAssign={access.canAssign}
            canDelete={access.canDelete}
            statusId={t.statusId}
            priorityId={t.priorityId}
            assigneeMembershipId={t.assigneeMembershipId}
            dueDate={t.dueAt ? t.dueAt.toISOString().slice(0, 10) : ""}
            estimateHours={t.estimateMinutes === null ? "" : String(Math.round((t.estimateMinutes / 60) * 100) / 100)}
            isClientVisible={t.isClientVisible}
            statuses={statusRows.map((s) => ({ value: s.id, label: s.name, color: s.color }))}
            priorities={priorityRows.map((p) => ({ value: p.id, label: p.name, color: p.color }))}
            assignees={team.map((m) => ({ value: m.membershipId, label: m.name || m.email }))}
            context={{
              project: project ? { id: project.id, label: `${project.key} · ${project.name}` } : null,
              client: client ? { id: client.id, label: client.name } : null,
              reporter: reporter ? reporter.name || reporter.email : null,
              created: fmt.format(t.createdAt),
            }}
          />
          <LinksCard ticketId={t.id} links={links} />
        </div>
      </div>
    </div>
  );
}
