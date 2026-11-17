"use server";
import { revalidatePath } from "next/cache";
import { and, asc, eq, ilike, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { comments, files, memberships, projectPhases, questionnaireResponses, tickets } from "@/db/schema";
import { audit } from "@/lib/audit";
import { answersToText, validateAnswers } from "@/lib/forms";
import { answerFileNames } from "@/lib/questionnaire";
import { announce, notify } from "@/lib/notify";
import { PortalError, portalProject, requirePortalWrite } from "@/lib/portal";
import { questionnaireForProject } from "@/lib/questionnaire";

export type SaveResult = { ok?: string; error?: string; errors?: Record<string, string> };

/** Saves intake answers. `submit` checks required questions and tells the team. Can be updated later. */
export async function saveQuestionnaire(projectId: string, values: Record<string, unknown>, submit: boolean): Promise<SaveResult> {
  try {
    const ctx = await requirePortalWrite();
    const project = await portalProject(ctx, projectId);
    if (!project) return { error: "Project not found." };
    const q = await questionnaireForProject(project.id);
    if (!q) return { error: "There's no questionnaire for this project." };

    const { clean, errors, ok } = validateAnswers(q.fields, values, { draft: !submit });
    if (!ok) return { error: submit ? "Please answer the required questions." : "Check the highlighted answers.", errors };

    // File answers must be files on this project
    const fileIds = q.fields.filter((f) => f.kind === "file").flatMap((f) => (clean[f.key] as string[] | undefined) ?? []);
    if (fileIds.length) {
      const found = await db
        .select({ id: files.id })
        .from(files)
        .where(and(inArray(files.id, fileIds), eq(files.projectId, project.id), isNull(files.deletedAt)));
      if (found.length !== new Set(fileIds).size) return { error: "One of the files is missing. Upload it again." };
    }

    const firstSubmit = submit && !q.response?.submittedAt;
    const now = new Date();
    await db
      .insert(questionnaireResponses)
      .values({
        orgId: ctx.orgId,
        projectId: project.id,
        questionnaireId: q.questionnaire.id,
        answers: clean,
        submittedAt: submit ? now : null,
        submittedByUserId: submit ? ctx.user.id : null,
      })
      .onConflictDoUpdate({
        target: [questionnaireResponses.projectId, questionnaireResponses.questionnaireId],
        set: { answers: clean, ...(submit ? { submittedAt: now, submittedByUserId: ctx.user.id } : {}) },
      });
    await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: "client", action: submit ? "questionnaire.submit" : "questionnaire.save", entityType: "project", entityId: project.id, entityKey: project.key, metadata: { questionnaire: q.questionnaire.name } });

    if (submit) {
      // The answers go to the Discovery tickets (or the first phase's) as an internal note
      const [discovery] = await db
        .select()
        .from(projectPhases)
        .where(and(eq(projectPhases.projectId, project.id), ilike(projectPhases.name, "%discovery%")))
        .orderBy(asc(projectPhases.position))
        .limit(1);
      const [first] = discovery ? [discovery] : await db.select().from(projectPhases).where(eq(projectPhases.projectId, project.id)).orderBy(asc(projectPhases.position)).limit(1);
      if (first) {
        const phaseTickets = await db.select({ id: tickets.id }).from(tickets).where(and(eq(tickets.projectPhaseId, first.id), isNull(tickets.deletedAt)));
        const body = `${firstSubmit ? "Intake answers" : "Updated intake answers"} from ${ctx.user.name || ctx.user.email}:\n\n${answersToText(q.fields, clean, await answerFileNames(clean, q.fields))}`;
        if (phaseTickets.length) await db.insert(comments).values(phaseTickets.map((t) => ({ orgId: ctx.orgId, ticketId: t.id, authorUserId: null, body: body.slice(0, 20_000), visibility: "internal" as const })));
      }
      const managers = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.status, "active"), inArray(memberships.role, ["admin", "manager"])));
      const msg = {
        title: `${ctx.user.name || ctx.user.email} ${firstSubmit ? "submitted" : "updated"} the ${q.questionnaire.name.toLowerCase()} for ${project.key}`,
        body: project.name,
        url: `/projects/${project.id}#intake`,
      };
      await notify(db, { orgId: ctx.orgId, userIds: managers.map((m) => m.userId), eventKey: "client.activity", ...msg });
      announce(ctx.orgId, "client.activity", msg);
    }
    revalidatePath(`/portal/projects/${project.id}`);
    revalidatePath("/portal");
    return { ok: submit ? (firstSubmit ? "Thanks! Your answers are in." : "Your updates are saved and we've been told.") : "Saved. You can finish later." };
  } catch (err) {
    if (err instanceof PortalError) return { error: err.message };
    throw err;
  }
}
