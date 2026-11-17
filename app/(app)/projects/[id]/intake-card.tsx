import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { answerFileNames, questionnaireForProject } from "@/lib/questionnaire";

/** The client's intake answers, read-only, for the team. */
export async function IntakeCard({ projectId, timezone }: { projectId: string; timezone: string }) {
  const q = await questionnaireForProject(projectId);
  if (!q) return null;
  const names = await answerFileNames(q.answers, q.fields);
  const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: timezone });
  const answered = q.fields.filter((f) => q.answers[f.key] !== undefined);

  return (
    <Card id="intake" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="size-4" />
          {q.questionnaire.name}
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          {q.response?.submittedAt ? (
            <>
              <Badge>Submitted</Badge> {fmt.format(q.response.submittedAt)}
            </>
          ) : q.response ? (
            <Badge variant="outline">Draft, not submitted</Badge>
          ) : (
            <Badge variant="outline">Not started</Badge>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {answered.length === 0 ? (
          <p className="text-sm text-muted-foreground">The client fills this in from the portal.</p>
        ) : (
          <dl className="space-y-3 text-sm">
            {answered.map((f) => {
              const a = q.answers[f.key];
              return (
                <div key={f.key}>
                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  <dd className="whitespace-pre-wrap">
                    {f.kind === "file"
                      ? (a as string[]).map((id) => (
                          <a key={id} href={`/api/files/${id}`} className="mr-2 text-primary hover:underline">
                            {names[id] ?? "file"}
                          </a>
                        ))
                      : Array.isArray(a)
                        ? a.join(", ")
                        : a}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
