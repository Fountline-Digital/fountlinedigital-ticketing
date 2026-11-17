import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { files, packageVersions, projects, questionnaireQuestions, questionnaireResponses, questionnaires } from "@/db/schema";
import type { Answers, Field } from "@/lib/forms";

/** The intake questionnaire for a project (from its package), its questions as form fields, and any saved answers. */
export async function questionnaireForProject(projectId: string) {
  const [row] = await db
    .select({ q: questionnaires })
    .from(projects)
    .innerJoin(packageVersions, eq(packageVersions.id, projects.packageVersionId))
    .innerJoin(questionnaires, and(eq(questionnaires.packageId, packageVersions.packageId), eq(questionnaires.isActive, true)))
    .where(eq(projects.id, projectId))
    .orderBy(desc(questionnaires.createdAt))
    .limit(1);
  if (!row) return null;
  const questions = await db
    .select()
    .from(questionnaireQuestions)
    .where(eq(questionnaireQuestions.questionnaireId, row.q.id))
    .orderBy(asc(questionnaireQuestions.position));
  const fields: Field[] = questions.map((q) => ({ key: q.id, label: q.label, kind: q.kind, options: q.options, required: q.isRequired, help: q.helpText }));
  const [response] = await db
    .select()
    .from(questionnaireResponses)
    .where(and(eq(questionnaireResponses.projectId, projectId), eq(questionnaireResponses.questionnaireId, row.q.id)));
  return { questionnaire: row.q, fields, response: response ?? null, answers: (response?.answers ?? {}) as Answers };
}

/** Names of files referenced by file answers (for display). */
export async function answerFileNames(answers: Answers, fields: Field[]) {
  const ids = fields.filter((f) => f.kind === "file").flatMap((f) => (answers[f.key] as string[] | undefined) ?? []);
  if (ids.length === 0) return {} as Record<string, string>;
  const rows = await db.select({ id: files.id, name: files.originalName }).from(files).where(inArray(files.id, ids));
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}
