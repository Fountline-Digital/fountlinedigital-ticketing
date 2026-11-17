import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { db } from "@/db";
import { requestForms, ticketTypes } from "@/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Field } from "@/lib/forms";
import { requirePortal } from "@/lib/portal";
import { portalProjects } from "@/lib/portal-queries";
import { RequestForm } from "./request-form";

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ form?: string; project?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePortal();
  const forms = await db
    .select({ f: requestForms, kind: ticketTypes.kind })
    .from(requestForms)
    .innerJoin(ticketTypes, eq(ticketTypes.id, requestForms.ticketTypeId))
    .where(and(eq(requestForms.orgId, ctx.orgId), eq(requestForms.isActive, true), inArray(ticketTypes.kind, ["support", "change_request"])))
    .orderBy(asc(requestForms.sortOrder));
  const projects = (await portalProjects(ctx)).filter((p) => p.project.status !== "cancelled").map((p) => ({ id: p.project.id, name: p.project.name }));
  const chosen = forms.find((f) => f.f.id === sp.form);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={chosen ? "/portal/requests/new" : "/portal/tickets"} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {chosen ? "Choose a different type" : "Requests"}
      </Link>

      {!chosen ? (
        <>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">New request</h1>
            <p className="text-muted-foreground">What do you need?</p>
          </div>
          <div className="grid gap-3">
            {forms.length === 0 && <p className="text-sm text-muted-foreground">Requests aren&apos;t open yet. Please email us instead.</p>}
            {forms.map(({ f, kind }) => (
              <Link key={f.id} href={`/portal/requests/new?form=${f.id}${sp.project ? `&project=${sp.project}` : ""}`} className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
                <Card className="transition-colors hover:bg-muted/40">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2">
                      {f.name}
                      <ArrowRight className="size-4" />
                    </CardTitle>
                    <CardDescription>
                      {kind === "change_request"
                        ? "Something new or different from what's in your package. We'll send you a price to approve first."
                        : "Help with something that isn't working, or a question about your project or site."}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">{chosen.f.name}</h1>
          <Card>
            <CardContent>
              <RequestForm
                formId={chosen.f.id}
                fields={chosen.f.fields as Field[]}
                projects={projects}
                projectRequired={chosen.kind === "change_request"}
                defaultProjectId={projects.some((p) => p.id === sp.project) ? sp.project! : projects.length === 1 ? projects[0].id : ""}
                readOnly={Boolean(ctx.preview)}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
