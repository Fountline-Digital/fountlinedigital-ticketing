"use server";
import { revalidatePath } from "next/cache";
import { and, count, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { teamRoles } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/session";
import { addStarterTeamRoles, slugify, teamRoleUsage, type TeamWidget, WIDGET_LABELS } from "@/lib/team-roles";

export type Result = { ok?: string; error?: string };

const PATHS = ["/settings/team-roles", "/settings/users", "/tickets", "/dashboard"];
const refresh = () => PATHS.forEach((p) => revalidatePath(p));
const WIDGETS = Object.keys(WIDGET_LABELS) as TeamWidget[];

export type RoleInput = { name: string; description: string; color: string; widgets: string[] };

function validate(input: RoleInput) {
  const name = input.name.trim();
  if (!name) return { error: "Give the role a name." };
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) return { error: "Pick a color." };
  const widgets = input.widgets.filter((w): w is TeamWidget => WIDGETS.includes(w as TeamWidget));
  return { name, description: input.description.trim() || null, color: input.color.toLowerCase(), widgets };
}

export async function createTeamRole(input: RoleInput): Promise<Result> {
  const ctx = await requirePermission("settings.manage");
  const v = validate(input);
  if ("error" in v) return { error: v.error };
  const key = slugify(v.name);
  if (!key) return { error: "Use letters or numbers in the name." };
  const [dupe] = await db.select().from(teamRoles).where(and(eq(teamRoles.orgId, ctx.orgId), eq(teamRoles.key, key)));
  if (dupe) return { error: `There's already a role called "${dupe.name}".` };
  const [{ n }] = await db.select({ n: count() }).from(teamRoles).where(eq(teamRoles.orgId, ctx.orgId));

  const [role] = await db.insert(teamRoles).values({ orgId: ctx.orgId, key, ...v, sortOrder: n }).returning();
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "team_role.create", entityType: "team_role", entityId: role.id, changes: { after: v } });
  refresh();
  return { ok: `Added ${v.name}.` };
}

export async function updateTeamRole(id: string, input: RoleInput): Promise<Result> {
  const ctx = await requirePermission("settings.manage");
  const [role] = await db.select().from(teamRoles).where(and(eq(teamRoles.id, id), eq(teamRoles.orgId, ctx.orgId)));
  if (!role) return { error: "Role not found." };
  const v = validate(input);
  if ("error" in v) return { error: v.error };
  const [dupe] = await db
    .select()
    .from(teamRoles)
    .where(and(eq(teamRoles.orgId, ctx.orgId), eq(teamRoles.key, slugify(v.name)), ne(teamRoles.id, id)));
  if (dupe) return { error: `There's already a role called "${dupe.name}".` };

  // The key stays the same so saved links and filters keep working after a rename.
  await db.update(teamRoles).set(v).where(eq(teamRoles.id, id));
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    action: "team_role.update",
    entityType: "team_role",
    entityId: id,
    changes: { before: { name: role.name, description: role.description, color: role.color, widgets: role.widgets }, after: v },
  });
  refresh();
  return { ok: "Saved." };
}

export async function setTeamRoleActive(id: string, active: boolean): Promise<Result> {
  const ctx = await requirePermission("settings.manage");
  const [role] = await db.select().from(teamRoles).where(and(eq(teamRoles.id, id), eq(teamRoles.orgId, ctx.orgId)));
  if (!role) return { error: "Role not found." };
  await db.update(teamRoles).set({ isActive: active }).where(eq(teamRoles.id, id));
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: active ? "team_role.restore" : "team_role.retire", entityType: "team_role", entityId: id });
  refresh();
  return { ok: active ? `${role.name} is back.` : `${role.name} is retired. Existing tickets keep it; it can't be picked for new work.` };
}

/** Delete only when nothing uses it; otherwise retire, so history stays intact. */
export async function deleteTeamRole(id: string): Promise<Result> {
  const ctx = await requirePermission("settings.manage");
  const [role] = await db.select().from(teamRoles).where(and(eq(teamRoles.id, id), eq(teamRoles.orgId, ctx.orgId)));
  if (!role) return { error: "Role not found." };
  const usage = await teamRoleUsage(ctx.orgId, id);
  if (usage.people + usage.tasks + usage.tickets > 0) {
    return {
      error: `${role.name} is used by ${usage.people} people, ${usage.tasks} template tasks and ${usage.tickets} tickets. Retire it instead, or remove it from those first.`,
    };
  }
  await db.delete(teamRoles).where(eq(teamRoles.id, id));
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "team_role.delete", entityType: "team_role", entityId: id, changes: { before: { name: role.name } } });
  refresh();
  return { ok: `Deleted ${role.name}.` };
}

export async function reorderTeamRoles(ids: string[]): Promise<Result> {
  const ctx = await requirePermission("settings.manage");
  for (const [i, id] of ids.entries()) {
    await db.update(teamRoles).set({ sortOrder: i }).where(and(eq(teamRoles.id, id), eq(teamRoles.orgId, ctx.orgId)));
  }
  refresh();
  return { ok: "Order saved." };
}

export async function addStarterRoles(): Promise<Result> {
  const ctx = await requirePermission("settings.manage");
  const { added, tagged } = await addStarterTeamRoles(ctx.orgId);
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "team_role.add_starters", entityType: "organization", entityId: ctx.orgId, metadata: { added, tagged } });
  refresh();
  return { ok: `Added ${added} roles${tagged ? ` and tagged ${tagged} template tasks` : ""}.` };
}
