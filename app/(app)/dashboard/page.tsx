import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { personalDashboard, teamDashboard } from "@/lib/dashboard";
import { can, ROLE_LABELS, type Role } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { listTeamRoles, memberTeamRoles } from "@/lib/team-roles";
import { TeamTab } from "./team-tab";
import { NotificationsCard } from "./notifications-card";
import { ApprovalsCard, MyTicketsCard, ProjectsCard, StatTile, WorkloadCard } from "./widgets";

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function ago(date: Date) {
  const s = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string; tab?: string }> }) {
  const { error, tab } = await searchParams;
  const { user, membership } = await requireUser();
  const role = membership.role as Role;
  const orgId = membership.orgId;
  const firstName = (user.name || "").split(" ")[0];
  const isTeamView = await can(orgId, role, "tickets.view_all");

  // Tabs: Overview + each team role this person has (admins/managers: every active role)
  const myRoles = await memberTeamRoles(membership.id);
  const allRoles = isTeamView ? await listTeamRoles(orgId) : [];
  const tabRoles = isTeamView ? allRoles.map((r) => ({ id: r.id, key: r.key, name: r.name, color: r.color })) : myRoles.map((r) => ({ id: r.teamRoleId, key: r.key, name: r.name, color: r.color }));
  const activeRole = tabRoles.find((r) => r.key === tab);

  const header = (
    <>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        // TODO(launch): remove this "Signed in as" line before go-live
        description={`Signed in as ${ROLE_LABELS[role]}`}
      />
      {tabRoles.length > 0 && (
        <nav className="flex gap-1 overflow-x-auto border-b text-sm" aria-label="Dashboard tabs">
          {[{ key: "", name: "Overview", color: "" }, ...tabRoles].map((t) => {
            const active = (activeRole?.key ?? "") === t.key;
            return (
              <Link
                key={t.key || "overview"}
                href={t.key ? `/dashboard?tab=${t.key}` : "/dashboard"}
                className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 ${active ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {t.color && <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} />}
                {t.name}
                {myRoles.some((m) => m.key === t.key && m.isLead) && <span className="text-xs text-muted-foreground">(lead)</span>}
              </Link>
            );
          })}
        </nav>
      )}
      {error === "forbidden" && (
        <p className="rounded-lg border border-primary/50 bg-muted p-3 text-sm text-foreground">You don&apos;t have access to that page.</p>
      )}
    </>
  );

  if (activeRole) {
    const leads = myRoles.some((m) => m.teamRoleId === activeRole.id && m.isLead) && role !== "contractor";
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        {header}
        <TeamTab orgId={orgId} teamRoleId={activeRole.id} onlyMembershipId={isTeamView || leads ? null : membership.id} />
      </div>
    );
  }

  if (isTeamView) {
    const d = await teamDashboard(orgId, membership.id, user.id);
    const notes = d.notifications.items.map((n) => ({ id: n.id, title: n.title, body: n.body, url: n.url, ago: ago(n.createdAt), unread: !n.readAt }));
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        {header}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <StatTile label="Open tickets" value={d.stats.open} href="/tickets" />
          <StatTile label="Overdue" value={d.stats.overdue} href="/tickets?due=overdue&sort=due" alert />
          <StatTile label="Due in 7 days" value={d.stats.dueWeek} href="/tickets?due=week&sort=due" />
          <StatTile
            label="Waiting on client"
            value={d.stats.waiting}
            href={d.stats.waitingStatusId ? `/tickets?status=${d.stats.waitingStatusId}` : "/tickets"}
          />
          <StatTile label="Unassigned" value={d.stats.unassigned} href="/tickets?assignee=none" />
          <StatTile label="Active projects" value={d.stats.activeProjects} href="/projects" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <div className="min-w-0 space-y-6">
            <ProjectsCard projects={d.projects} />
            <MyTicketsCard tickets={d.mine} />
          </div>
          <div className="space-y-6">
            <ApprovalsCard approvals={d.approvals} />
            <WorkloadCard people={d.workload} unassigned={d.unassignedLoad} />
            <NotificationsCard items={notes} unread={d.notifications.unread} />
          </div>
        </div>
      </div>
    );
  }

  const d = await personalDashboard(orgId, membership.id, user.id);
  const notes = d.notifications.items.map((n) => ({ id: n.id, title: n.title, body: n.body, url: n.url, ago: ago(n.createdAt), unread: !n.readAt }));
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {header}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="My open tickets" value={d.stats.open} href="/tickets?assignee=me" />
        <StatTile label="Overdue" value={d.stats.overdue} href="/tickets?assignee=me&due=overdue&sort=due" alert />
        <StatTile label="Due in 7 days" value={d.stats.dueWeek} href="/tickets?assignee=me&due=week&sort=due" />
        <StatTile label="Waiting on others" value={d.stats.blocked} href="/tickets?assignee=me" hint="Blocked by unfinished tickets" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <MyTicketsCard tickets={d.mine} />
          <ProjectsCard projects={d.projects} title="My projects" />
        </div>
        <NotificationsCard items={notes} unread={d.notifications.unread} />
      </div>
    </div>
  );
}
