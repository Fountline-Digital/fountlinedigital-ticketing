import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { getOrg, SETTING_DEFAULTS } from "@/lib/org-settings";
import { requirePermission } from "@/lib/session";
import { DEFAULT_ALLOWED_TYPES } from "@/lib/storage";
import { saveFilesData } from "../actions";
import { BackToSettings } from "../back";
import { Field, SettingsForm } from "../settings-form";
import { EXPORTS } from "@/lib/exports";

export default async function DataSettings() {
  const ctx = await requirePermission("settings.manage");
  const s = (await getOrg(ctx.orgId)).settings;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackToSettings />
      <PageHeader title="Files & data" />
      <SettingsForm title="Uploads, retention and archiving" action={saveFilesData}>
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <Field label="Max file size (MB)" htmlFor="maxUploadMb">
            <Input id="maxUploadMb" name="maxUploadMb" type="number" min={1} max={500} defaultValue={s.maxUploadMb ?? SETTING_DEFAULTS.maxUploadMb} />
          </Field>
          <Field label="Allowed file types" htmlFor="fileTypes" hint="Separate with commas. Programs and scripts (exe, js, html…) are always blocked.">
            <Input id="fileTypes" name="fileTypes" defaultValue={(s.allowedFileTypes ?? DEFAULT_ALLOWED_TYPES).join(", ")} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Keep Trash for (days)" htmlFor="trashDays" hint="Then deleted for good, nightly.">
            <Input id="trashDays" name="trashDays" type="number" min={1} max={365} defaultValue={s.trashRetentionDays ?? SETTING_DEFAULTS.trashRetentionDays} />
          </Field>
          <Field label="Audit log in the app (days)" htmlFor="auditDays" hint="Older entries move to file storage (R2). Minimum 31.">
            <Input id="auditDays" name="auditDays" type="number" min={31} max={3650} defaultValue={s.auditHotDays ?? SETTING_DEFAULTS.auditHotDays} />
          </Field>
          <Field label="Archive completed projects after (months)" htmlFor="archiveMonths" hint="Archived projects leave the lists and the portal; nothing is deleted.">
            <Input id="archiveMonths" name="archiveMonths" type="number" min={1} max={120} defaultValue={s.archiveClosedProjectsAfterMonths ?? SETTING_DEFAULTS.archiveClosedProjectsAfterMonths} />
          </Field>
        </div>
      </SettingsForm>
      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
          <CardDescription>Spreadsheet (CSV) downloads of your data. Each export is logged. The audit log has its own export.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.entries(EXPORTS).map(([key, e]) => (
            <a key={key} href={`/api/export/${key}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Download /> {e.label}
            </a>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
