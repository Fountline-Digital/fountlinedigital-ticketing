import { notFound } from "next/navigation";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { packages, questionnaireQuestions, questionnaireResponses, questionnaires } from "@/db/schema";
import { requirePermission } from "@/lib/session";
import { QuestionnaireEditor } from "./questionnaire-editor";

export default async function PackageQuestionnairePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("packages.manage");
  const [pkg] = await db.select().from(packages).where(and(eq(packages.id, id), eq(packages.orgId, ctx.orgId)));
  if (!pkg) notFound();
  const [qn] = await db.select().from(questionnaires).where(eq(questionnaires.packageId, pkg.id)).orderBy(desc(questionnaires.createdAt)).limit(1);
  const questions = qn ? await db.select().from(questionnaireQuestions).where(eq(questionnaireQuestions.questionnaireId, qn.id)).orderBy(asc(questionnaireQuestions.position)) : [];
  const [answered] = qn ? await db.select({ n: count() }).from(questionnaireResponses).where(eq(questionnaireResponses.questionnaireId, qn.id)) : [{ n: 0 }];

  return (
    <QuestionnaireEditor
      // Remount after each save so new questions pick up their saved ids
      key={`${qn?.updatedAt?.toISOString() ?? "new"}-${questions.map((q) => q.id).join(",")}`}
      packageId={pkg.id}
      exists={Boolean(qn)}
      responses={answered?.n ?? 0}
      initial={{
        name: qn?.name ?? "Intake questionnaire",
        isActive: qn?.isActive ?? true,
        questions: questions.map((q) => ({ id: q.id, label: q.label, kind: q.kind, options: q.options, isRequired: q.isRequired, helpText: q.helpText ?? "" })),
      }}
    />
  );
}
