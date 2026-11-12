import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, packageVersions, packages, serviceLines, users } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDraft, getEditableVersion } from "@/lib/packages";
import { requirePermission } from "@/lib/session";
import { DetailsForm, VersionSettingsForm } from "./settings-forms";

export default async function PackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("packages.manage");

  const [row] = await db
    .select({ pkg: packages, lineCode: serviceLines.code })
    .from(packages)
    .innerJoin(serviceLines, eq(serviceLines.id, packages.serviceLineId))
    .where(and(eq(packages.id, id), eq(packages.orgId, ctx.orgId)));
  if (!row) notFound();
  const { pkg } = row;

  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  const draft = await getDraft(pkg.id);
  const editable = await getEditableVersion(pkg.id);

  const history = await db
    .select({ v: packageVersions, by: users.name, byEmail: users.email })
    .from(packageVersions)
    .leftJoin(users, eq(users.id, packageVersions.createdByUserId))
    .where(eq(packageVersions.packageId, pkg.id))
    .orderBy(desc(packageVersions.version));

  const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: org.timezone });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Saved right away. Not part of versions.</CardDescription>
        </CardHeader>
        <CardContent>
          <DetailsForm
            packageId={pkg.id}
            name={pkg.name}
            description={pkg.description ?? ""}
            price={pkg.priceCents === null ? "" : String(pkg.priceCents / 100)}
          />
        </CardContent>
      </Card>

      {editable && (
        <Card>
          <CardHeader>
            <CardTitle>Project settings</CardTitle>
            <CardDescription>
              {draft
                ? `Editing draft v${draft.version}. Changes go live when you publish.`
                : "Saving creates a draft. Projects only pick up changes after you publish."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VersionSettingsForm
              packageId={pkg.id}
              revisionRounds={editable.revisionRounds}
              responseHours={editable.responseTargetMinutes === null ? "" : String(editable.responseTargetMinutes / 60)}
              pickerAccess={editable.pickerAccess}
              websiteDesignsOffered={editable.websiteDesignsOffered === null ? "" : String(editable.websiteDesignsOffered)}
              logoConceptsPerBatch={editable.logoConceptsPerBatch === null ? "" : String(editable.logoConceptsPerBatch)}
              closeoutChecklist={editable.closeoutChecklist.join("\n")}
              isWeb={row.lineCode === "WEB"}
              isBranding={row.lineCode === "BRD"}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Version history</CardTitle>
          <CardDescription>Running projects stay on the version they started with.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {history.map(({ v, by, byEmail }) => (
              <li key={v.id} className="flex flex-col gap-1 border-b pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">
                      {pkg.key}-v{v.version}
                    </span>
                    {v.id === pkg.currentVersionId && <Badge>Live</Badge>}
                    {!v.publishedAt && <Badge variant="outline">Draft</Badge>}
                  </div>
                  {v.notes && <p className="mt-1 text-sm text-muted-foreground">{v.notes}</p>}
                </div>
                <div className="text-xs text-muted-foreground sm:text-right">
                  {v.publishedAt ? `Published ${fmt.format(v.publishedAt)}` : `Started ${fmt.format(v.createdAt)}`}
                  <div>{by || byEmail || "System"}</div>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
