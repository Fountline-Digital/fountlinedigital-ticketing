import { teamTab } from "@/lib/team-dashboard";
import { ApprovalsCard, LaunchesCard, PipelineCard, ResponseTargetsCard, StatTile, TicketListCard, WorkloadCard } from "./widgets";

export async function TeamTab({ orgId, teamRoleId, onlyMembershipId }: { orgId: string; teamRoleId: string; onlyMembershipId: string | null }) {
  const d = await teamTab(orgId, teamRoleId, onlyMembershipId);
  if (!d) return <p className="text-sm text-muted-foreground">This team role no longer exists.</p>;
  const teamView = onlyMembershipId === null;
  const q = `teamRole=${d.role.id}`;
  const mine = teamView ? "" : "&assignee=me";
  const w = d.widgets;

  const widgetCards = d.role.widgets.map((key) => {
    switch (key) {
      case "waiting_on_client":
        return <TicketListCard key={key} title="Waiting on client" description="Paused until the client responds." tickets={w.waiting_on_client ?? []} empty="Nothing waiting on clients." />;
      case "blocked":
        return <TicketListCard key={key} title="Blocked work" description="Waiting on other unfinished tickets." tickets={w.blocked ?? []} empty="Nothing blocked." />;
      case "approvals":
        return <ApprovalsCard key={key} approvals={w.approvals ?? []} />;
      case "launches":
        return <LaunchesCard key={key} launches={w.launches ?? []} />;
      case "response_targets":
        return <ResponseTargetsCard key={key} tickets={w.response_targets ?? []} />;
      case "lead_pipeline":
        return <PipelineCard key={key} stages={w.lead_pipeline?.stages ?? []} followUps={w.lead_pipeline?.followUps ?? []} />;
      default:
        return null;
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: d.role.color }} />
        {teamView ? `Everything the ${d.role.name} team is working on.` : `Your ${d.role.name} work.`}
        {d.role.description && <span className="hidden md:inline">· {d.role.description}</span>}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label={teamView ? "Open" : "My open"} value={d.stats.open} href={`/tickets?${q}${mine}`} />
        <StatTile label="Overdue" value={d.stats.overdue} href={`/tickets?${q}${mine}&due=overdue&sort=due`} alert />
        <StatTile label="Due in 7 days" value={d.stats.dueWeek} href={`/tickets?${q}${mine}&due=week&sort=due`} />
        {teamView ? (
          <StatTile label="Unassigned" value={d.stats.unassigned} href={`/tickets?${q}&assignee=none`} alert />
        ) : (
          <StatTile label="All team work" value={d.stats.open} href={`/tickets?${q}`} hint="Only what you can see" />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <TicketListCard
            title={teamView ? `Open ${d.role.name} tickets` : `My ${d.role.name} tickets`}
            description="Soonest due first."
            tickets={d.list}
            href={`/tickets?${q}${mine}&sort=due`}
            empty="Nothing open."
          />
          {widgetCards.filter((_, i) => i % 2 === 0)}
        </div>
        <div className="space-y-6">
          {teamView && <WorkloadCard title={`${d.role.name} workload`} people={d.workload} unassigned={d.stats.unassigned} linkSuffix={`&${q}`} />}
          {widgetCards.filter((_, i) => i % 2 === 1)}
        </div>
      </div>
    </div>
  );
}
