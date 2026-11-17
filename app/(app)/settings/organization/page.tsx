import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { getOrg } from "@/lib/org-settings";
import { requirePermission } from "@/lib/session";
import { saveOrganization } from "../actions";
import { BackToSettings } from "../back";
import { Field, selectClass, SettingsForm } from "../settings-form";

export default async function OrganizationSettings() {
  const ctx = await requirePermission("settings.manage");
  const org = await getOrg(ctx.orgId);
  const zones = Intl.supportedValuesOf("timeZone");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackToSettings />
      <PageHeader title="Organization" />
      <SettingsForm title="Details" action={saveOrganization}>
        <Field label="Business name" htmlFor="name" hint="Shown in emails, the portal and invites.">
          <Input id="name" name="name" defaultValue={org.name} required />
        </Field>
        <Field label="Time zone" htmlFor="timezone" hint="Used for dates, business hours, response targets and the nightly jobs' reports.">
          <select id="timezone" name="timezone" defaultValue={org.timezone} className={selectClass}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Key prefix" htmlFor="prefix" hint="Starts every key (FDT-1042, FDP-WEB-2601). Fixed once set, so existing keys never change.">
          <Input id="prefix" value={org.keyPrefix} readOnly disabled className="w-24 font-mono" />
        </Field>
      </SettingsForm>
    </div>
  );
}
