import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rolePermissions } from "@/db/schema";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { getOrg, SETTING_DEFAULTS } from "@/lib/org-settings";
import { DEFAULT_PERMISSIONS, LOCKED, PERMISSION_LABELS, ROLE_LABELS, type Permission, type Role } from "@/lib/permissions";
import { requirePermission } from "@/lib/session";
import { saveAccess } from "../actions";
import { BackToSettings } from "../back";
import { Field, SettingsForm } from "../settings-form";
import { PermissionMatrix } from "./permission-matrix";

const ROLES: Role[] = ["admin", "manager", "worker", "contractor", "client"];

export default async function AccessSettings() {
  const ctx = await requirePermission("settings.manage");
  const org = await getOrg(ctx.orgId);
  const s = org.settings;
  const overrides = await db.select().from(rolePermissions).where(eq(rolePermissions.orgId, ctx.orgId));
  const hours = (r: Role) => Math.round((s.sessionMinutesByRole?.[r] ?? SETTING_DEFAULTS.sessionMinutesByRole[r]) / 60);

  const matrix = (Object.keys(DEFAULT_PERMISSIONS) as Permission[]).map((p) => ({
    permission: p,
    label: PERMISSION_LABELS[p],
    locked: LOCKED.includes(p),
    roles: (["manager", "worker", "contractor"] as Role[]).map((r) => {
      const o = overrides.find((x) => x.role === r && x.permission === p);
      const byDefault = (DEFAULT_PERMISSIONS[p] as readonly Role[]).includes(r);
      return { role: r, allowed: o ? o.allowed : byDefault, changed: Boolean(o) };
    }),
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BackToSettings />
      <PageHeader title="Access & security" description="Two-factor sign-in is always required for everyone, and can't be turned off." />
      <SettingsForm title="Sign-in" action={saveAccess}>
        <Field label="Team Google Workspace domains" htmlFor="domains" hint="People with these email addresses can sign in with Google and be invited as Admin, Manager or Worker. Separate with commas.">
          <Input id="domains" name="domains" defaultValue={(s.allowedGoogleDomains ?? []).join(", ")} placeholder="fountlinedigital.com" />
        </Field>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Stay signed in for (hours)</legend>
          <p className="text-xs text-muted-foreground">After this long, people sign in again (with two-factor). Defaults: 1 week for the team, 1 day for contractors, 30 days for clients.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {ROLES.map((r) => (
              <label key={r} className="grid gap-1 text-xs">
                {ROLE_LABELS[r]}
                <Input name={`session-${r}`} type="number" min={1} max={2160} defaultValue={hours(r)} />
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contractor access lasts (days)" htmlFor="contractorDays" hint="Default end date when inviting a contractor. You can change it per person.">
            <Input id="contractorDays" name="contractorDays" type="number" min={1} max={730} defaultValue={s.contractorDefaultAccessDays ?? SETTING_DEFAULTS.contractorDefaultAccessDays} />
          </Field>
          <Field label="Invite links expire after (hours)" htmlFor="inviteHours">
            <Input id="inviteHours" name="inviteHours" type="number" min={1} max={720} defaultValue={s.inviteExpiryHours ?? SETTING_DEFAULTS.inviteExpiryHours} />
          </Field>
        </div>
      </SettingsForm>
      <PermissionMatrix rows={matrix} />
    </div>
  );
}
