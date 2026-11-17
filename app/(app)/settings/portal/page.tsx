import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { getOrg } from "@/lib/org-settings";
import { requirePermission } from "@/lib/session";
import { savePortal } from "../actions";
import { BackToSettings } from "../back";
import { Field, SettingsForm } from "../settings-form";

export default async function PortalSettings() {
  const ctx = await requirePermission("settings.manage");
  const p = (await getOrg(ctx.orgId)).settings.portal ?? {};
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackToSettings />
      <PageHeader
        title="Client portal"
        description="What clients see at portal.fountlinedigital.com. Internal comments, time estimates and other clients are never shown. Preview it with View portal as… on a client contact."
      />
      <SettingsForm title="Portal" action={savePortal}>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Show clients</legend>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="showDueDates" defaultChecked={p.showDueDates ?? true} /> Due dates on their requests
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="showAssigneeNames" defaultChecked={p.showAssigneeNames ?? false} /> Who&apos;s working on each request
          </label>
        </fieldset>
        <Field label="Welcome message" htmlFor="welcomeMessage" hint="Under the greeting on their home page. Leave empty for the default.">
          <Textarea id="welcomeMessage" name="welcomeMessage" rows={2} maxLength={500} defaultValue={p.welcomeMessage ?? ""} />
        </Field>
        <Field label="Announcement banner" htmlFor="bannerMessage" hint="A strip across the top of every portal page, e.g. holiday hours. Leave empty to hide it.">
          <Input id="bannerMessage" name="bannerMessage" maxLength={300} defaultValue={p.bannerMessage ?? ""} placeholder="We're closed Nov 26-27 for Thanksgiving." />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Support email" htmlFor="supportEmail" hint="Shown in the portal footer.">
            <Input id="supportEmail" name="supportEmail" type="email" defaultValue={p.supportEmail ?? ""} placeholder="support@fountlinedigital.com" />
          </Field>
          <Field label="Support phone" htmlFor="supportPhone">
            <Input id="supportPhone" name="supportPhone" type="tel" defaultValue={p.supportPhone ?? ""} />
          </Field>
        </div>
        <Field label="Approval wording" htmlFor="approvalWording" hint="Shown when a client reviews a step for sign-off. Leave empty for the default.">
          <Textarea
            id="approvalWording"
            name="approvalWording"
            rows={2}
            maxLength={500}
            defaultValue={p.approvalWording ?? ""}
            placeholder="Approve it to move on, or tell us what to change."
          />
        </Field>
      </SettingsForm>
    </div>
  );
}
