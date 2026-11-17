import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { portalProject, requirePortal } from "@/lib/portal";
import { answerFileNames, questionnaireForProject } from "@/lib/questionnaire";
import { QuestionnaireForm } from "./questionnaire-form";

export default async function QuestionnairePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePortal();
  const project = await portalProject(ctx, id);
  if (!project) notFound();
  const q = await questionnaireForProject(project.id);
  if (!q) notFound();
  const names = await answerFileNames(q.answers, q.fields);
  const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: ctx.org.timezone });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/portal/projects/${project.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {project.name}
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{q.questionnaire.name}</h1>
        <p className="text-muted-foreground">
          {q.response?.submittedAt
            ? `Submitted ${fmt.format(q.response.submittedAt)}. You can update your answers any time.`
            : "Tell us about your business so we can plan your project. Save as you go and finish later if you need to."}
        </p>
      </div>
      <Card>
        <CardContent>
          <QuestionnaireForm
            projectId={project.id}
            fields={q.fields}
            initial={q.answers}
            fileNames={names}
            submitted={Boolean(q.response?.submittedAt)}
            readOnly={Boolean(ctx.preview)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
