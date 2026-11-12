import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { clients, invites, memberships, membershipTeamRoles, organizations, userMfa, users } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, INVITABLE_ROLES, ROLE_LABELS, type Role } from "@/lib/permissions";
import { requirePermission } from "@/lib/session";
import { listTeamRoles } from "@/lib/team-roles";
import { InviteDialog } from "./invite-form";
import { InviteActions, MemberActions } from "./row-actions";

export default async function UsersPage() {
  const ctx = await requirePermission("users.view");
  const canManage = await can(ctx.orgId, ctx.role, "users.manage");
  const canInvite = await can(ctx.orgId, ctx.role, "users.invite");

  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: org.timezone });
  const now = new Date();

  const members = await db
    .select({
      id: memberships.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
      status: memberships.status,
      accessExpiresAt: memberships.accessExpiresAt,
      lastSeenAt: users.lastSeenAt,
      clientName: clients.name,
      mfaEnabledAt: userMfa.enabledAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(clients, eq(clients.id, memberships.clientId))
    .leftJoin(userMfa, eq(userMfa.userId, users.id))
    .where(eq(memberships.orgId, ctx.orgId))
    .orderBy(asc(memberships.role), asc(users.email));

  const openInvites = await db
    .select({
      id: invites.id,
      email: invites.email,
      role: invites.role,
      expiresAt: invites.expiresAt,
      clientName: clients.name,
      invitedBy: users.email,
    })
    .from(invites)
    .leftJoin(clients, eq(clients.id, invites.clientId))
    .leftJoin(users, eq(users.id, invites.invitedByUserId))
    .where(and(eq(invites.orgId, ctx.orgId), isNull(invites.acceptedAt), isNull(invites.revokedAt)))
    .orderBy(asc(invites.createdAt));

  const clientOptions = await db
    .select({ value: clients.id, label: clients.name })
    .from(clients)
    .where(and(eq(clients.orgId, ctx.orgId), isNull(clients.deletedAt)))
    .orderBy(asc(clients.name));

  const roles = await listTeamRoles(ctx.orgId);
  const memberRoles = members.length
    ? await db
        .select()
        .from(membershipTeamRoles)
        .where(inArray(membershipTeamRoles.membershipId, members.map((m) => m.id)))
    : [];
  const roleById = new Map(roles.map((r) => [r.id, r] as const));
  const teamRoleChoices = roles.map((r) => ({ value: r.id, label: r.name, color: r.color }));

  const roleOptions = INVITABLE_ROLES[ctx.role].map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  const teamRoleOptions = (["admin", "manager", "worker", "contractor"] as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Users & invites"
        description="Invite-only access. Everyone uses two-factor."
        actions={
          canInvite && (
            <InviteDialog
              roles={roleOptions}
              clients={clientOptions}
              staffDomains={org.settings.allowedGoogleDomains ?? []}
              contractorDays={org.settings.contractorDefaultAccessDays ?? 90}
              teamRoles={teamRoleChoices}
            />
          )
        }
      />

      {openInvites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invites</CardTitle>
            <CardDescription>{openInvites.length} waiting to be accepted</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden md:table-cell">Invited by</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {openInvites.map((i) => {
                  const expired = i.expiresAt <= now;
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.email}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span>{ROLE_LABELS[i.role as Role]}</span>
                          {i.clientName && <span className="text-xs text-muted-foreground">{i.clientName}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{i.invitedBy ?? "System"}</TableCell>
                      <TableCell>{expired ? <Badge variant="destructive">Expired</Badge> : fmt.format(i.expiresAt)}</TableCell>
                      <TableCell className="text-right">{canInvite && <InviteActions inviteId={i.id} email={i.email} />}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>People</CardTitle>
          <CardDescription>{members.length} with access</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Access</TableHead>
                <TableHead className="hidden md:table-cell">Team roles</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Two-factor</TableHead>
                <TableHead className="hidden lg:table-cell">Access ends</TableHead>
                <TableHead className="hidden lg:table-cell">Last active</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const expired = m.accessExpiresAt !== null && m.accessExpiresAt <= now;
                const isSelf = m.userId === ctx.user.id;
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="font-medium">
                        {m.name || m.email}
                        {isSelf && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">{m.email}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span>{ROLE_LABELS[m.role as Role]}</span>
                        {m.clientName && <span className="text-xs text-muted-foreground">{m.clientName}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {memberRoles
                          .filter((r) => r.membershipId === m.id && roleById.has(r.teamRoleId))
                          .map((r) => (
                            <Badge key={r.teamRoleId} variant={r.isLead ? "default" : "outline"}>
                              <span className="size-2 rounded-full" style={{ backgroundColor: roleById.get(r.teamRoleId)!.color }} />
                              {roleById.get(r.teamRoleId)!.name}
                              {r.isLead && " lead"}
                            </Badge>
                          ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {m.status === "suspended" ? (
                        <Badge variant="destructive">Deactivated</Badge>
                      ) : expired ? (
                        <Badge variant="destructive">Access ended</Badge>
                      ) : m.status === "active" ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="outline">{m.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {m.mfaEnabledAt ? <Badge variant="outline">On</Badge> : <Badge variant="outline">Not set up</Badge>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{m.accessExpiresAt ? fmt.format(m.accessExpiresAt) : "—"}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {m.lastSeenAt ? fmt.format(m.lastSeenAt) : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage && !isSelf && (
                        <MemberActions
                          membershipId={m.id}
                          name={m.name || m.email}
                          role={m.role}
                          isActive={m.status === "active"}
                          isContractor={m.role === "contractor"}
                          accessEnds={m.accessExpiresAt ? m.accessExpiresAt.toISOString().slice(0, 10) : ""}
                          roles={m.role === "client" ? [] : teamRoleOptions}
                          teamRoles={m.role === "client" ? [] : teamRoleChoices}
                          currentTeamRoles={memberRoles.filter((r) => r.membershipId === m.id).map((r) => ({ teamRoleId: r.teamRoleId, isLead: r.isLead }))}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
