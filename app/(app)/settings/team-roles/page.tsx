import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/session";
import { listTeamRoles, teamRoleUsage, WIDGET_LABELS } from "@/lib/team-roles";
import { TeamRolesManager } from "./team-roles-manager";

export default async function TeamRolesPage() {
  const ctx = await requirePermission("settings.manage");
  const roles = await listTeamRoles(ctx.orgId, false);
  const withUsage = await Promise.all(roles.map(async (r) => ({ ...r, usage: await teamRoleUsage(ctx.orgId, r.id) })));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Team roles"
        description="What people do: departments like Sales or Design. Separate from access level, which controls what they're allowed to do."
      />
      <TeamRolesManager
        roles={withUsage.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description ?? "",
          color: r.color,
          widgets: r.widgets,
          isActive: r.isActive,
          usage: r.usage,
        }))}
        widgets={Object.entries(WIDGET_LABELS).map(([value, w]) => ({ value, label: w.label, hint: w.hint }))}
      />
    </div>
  );
}
