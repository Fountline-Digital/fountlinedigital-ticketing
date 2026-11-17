"use server";
import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { packages, questionnaireQuestions, questionnaires } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/session";

export type QuestionInput = {
  id?: string;
  label: string;
  kind: "short_text" | "long_text" | "single_select" | "multi_select" | "file" | "url" | "date";
  options: string[];
  isRequired: boolean;
  helpText: string;
};
export type Result = { ok?: string; error?: string };
const KINDS = ["short_text", "long_text", "single_select", "multi_select", "file", "url", "date"];

/**
 * Saves the package's intake questionnaire: name, on/off, and the full question list in
 * order. Questions keep their ids, so answers clients already gave stay attached.
 */
export async function saveQuestionnaire(packageId: string, input: { name: string; isActive: boolean; questions: QuestionInput[] }): Promise<Result> {
  const ctx = await requirePermission("packages.manage");
  const [pkg] = await db.select().from(packages).where(and(eq(packages.id, packageId), eq(packages.orgId, ctx.orgId)));
  if (!pkg) return { error: "Package not found." };
  const name = input.name.trim();
  if (!name) return { error: "Name the questionnaire." };
  if (input.questions.length > 60) return { error: "Keep it under 60 questions." };
  for (const [i, q] of input.questions.entries()) {
    if (!q.label.trim()) return { error: `Question ${i + 1} needs a label.` };
    if (!KINDS.includes(q.kind)) return { error: `Question ${i + 1} has an unknown type.` };
    if ((q.kind === "single_select" || q.kind === "multi_select") && q.options.filter((o) => o.trim()).length < 2) return { error: `Question ${i + 1} needs at least two options.` };
  }

  const qid = await db.transaction(async (tx) => {
    let [qn] = await tx.select().from(questionnaires).where(eq(questionnaires.packageId, pkg.id)).orderBy(desc(questionnaires.createdAt)).limit(1);
    if (qn) await tx.update(questionnaires).set({ name, isActive: input.isActive }).where(eq(questionnaires.id, qn.id));
    else [qn] = await tx.insert(questionnaires).values({ orgId: ctx.orgId, packageId: pkg.id, name, isActive: input.isActive }).returning();

    const existing = await tx.select({ id: questionnaireQuestions.id }).from(questionnaireQuestions).where(eq(questionnaireQuestions.questionnaireId, qn.id));
    const keepIds = input.questions.map((q) => q.id).filter((id): id is string => Boolean(id) && existing.some((e) => e.id === id));
    // Removed questions go (answers stay in saved responses, just not shown)
    await tx
      .delete(questionnaireQuestions)
      .where(and(eq(questionnaireQuestions.questionnaireId, qn.id), keepIds.length ? notInArray(questionnaireQuestions.id, keepIds) : undefined));
    // Park kept questions on negative positions so reordering can't collide with the unique position
    if (keepIds.length) {
      const kept = await tx.select({ id: questionnaireQuestions.id }).from(questionnaireQuestions).where(inArray(questionnaireQuestions.id, keepIds));
      for (const [i, k] of kept.entries()) await tx.update(questionnaireQuestions).set({ position: -(i + 1) }).where(eq(questionnaireQuestions.id, k.id));
    }
    for (const [i, q] of input.questions.entries()) {
      const values = {
        position: i + 1,
        label: q.label.trim().slice(0, 300),
        kind: q.kind,
        options: q.kind === "single_select" || q.kind === "multi_select" ? [...new Set(q.options.map((o) => o.trim()).filter(Boolean))].slice(0, 30) : [],
        isRequired: q.isRequired,
        helpText: q.helpText.trim().slice(0, 500) || null,
      };
      if (q.id && keepIds.includes(q.id)) await tx.update(questionnaireQuestions).set(values).where(eq(questionnaireQuestions.id, q.id));
      else await tx.insert(questionnaireQuestions).values({ orgId: ctx.orgId, questionnaireId: qn.id, ...values });
    }
    return qn.id;
  });

  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "questionnaire.update", entityType: "package", entityId: pkg.id, entityKey: pkg.key, metadata: { questionnaireId: qid, questions: input.questions.length, isActive: input.isActive } });
  revalidatePath(`/packages/${pkg.id}/questionnaire`);
  return { ok: "Questionnaire saved. Projects on this package use it right away." };
}
