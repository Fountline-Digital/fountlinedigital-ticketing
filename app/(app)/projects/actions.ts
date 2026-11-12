"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { clients, memberships, projectMembers, projects } from "@/db/schema";
import { audit } from "@/lib/audit";
import { ProjectError, createProjectFromPackage } from "@/lib/projects";
import { requirePermission } from "@/lib/session";

export type FormState = { ok?: string; error?: string; at?: number };
export type Result = { ok?: string; error?: string };

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function createProject(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePermission("projects.manage");
  const clientId = str(formData.get("clientId"));
  const packageId = str(formData.get("packageId"));
  const name = str(formData.get("name"));
  const startDate = str(formData.get("startDate")) || null;
  const targetLaunchDate = str(formData.get("targetLaunchDate")) || null;

  const fail = (error: string): FormState => ({ error, at: Date.now() });
  if (!clientId || !packageId) return fail("Choose a client and a package.");
  if (!name) return fail("Give the project a name.");
  if ((startDate && !DATE.test(startDate)) || (targetLaunchDate && !DATE.test(targetLaunchDate))) return fail("Check the dates.");
  if (startDate && targetLaunchDate && targetLaunchDate < startDate) return fail("Target launch can't be before the start date.");

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.orgId, ctx.orgId), isNull(clients.deletedAt)));
  if (!client) return fail("Client not found.");

  let created;
  try {
    created = await createProjectFromPackage({
      orgId: ctx.orgId,
      clientId,
      packageId,
      name,
      startDate,
      targetLaunchDate,
      createdByUserId: ctx.user.id,
      creatorMembershipId: ctx.membership.id,
    });
  } catch (err) {
    if (err instanceof ProjectError) return fail(err.message);
    throw err;
  }

  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    action: "project.create",
    entityType: "project",
    entityId: created.project.id,
    entityKey: created.project.key,
    metadata: { client: client.key, package: created.packageKey, tickets: created.ticketCount },
  });
  revalidatePath("/projects");
  revalidatePath(`/clients/${clientId}`);
  redirect(`/projects/${created.project.id}?created=1`);
}

async function projectInOrg(orgId: string, projectId: string) {
  const [p] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.orgId, orgId), isNull(projects.deletedAt)));
  return p ?? null;
}

export async function addProjectMember(projectId: string, membershipId: string): Promise<Result> {
  const ctx = await requirePermission("projects.manage");
  const project = await projectInOrg(ctx.orgId, projectId);
  if (!project) return { error: "Project not found." };
  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.id, membershipId), eq(memberships.orgId, ctx.orgId), eq(memberships.status, "active")));
  if (!m || m.role === "client") return { error: "Only active team members and contractors can be added." };

  await db.insert(projectMembers).values({ projectId, membershipId }).onConflictDoNothing();
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "project.member_add", entityType: "project", entityId: projectId, entityKey: project.key, metadata: { membershipId } });
  revalidatePath(`/projects/${projectId}`);
  return { ok: "Added to the project." };
}

export async function removeProjectMember(projectId: string, membershipId: string): Promise<Result> {
  const ctx = await requirePermission("projects.manage");
  const project = await projectInOrg(ctx.orgId, projectId);
  if (!project) return { error: "Project not found." };
  await db.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.membershipId, membershipId)));
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "project.member_remove", entityType: "project", entityId: projectId, entityKey: project.key, metadata: { membershipId } });
  revalidatePath(`/projects/${projectId}`);
  return { ok: "Removed from the project." };
}
