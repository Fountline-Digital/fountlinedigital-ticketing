import { eq } from "drizzle-orm";
import { db } from "@/db";
import { automationRules } from "@/db/schema";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/session";
import { saveAutomation } from "../actions";
import { BackToSettings } from "../back";
import { SettingsForm } from "../settings-form";

const RULES = [
  { kind: "approval_reminder", title: "Remind about pending sign-offs", hint: "Managers get a reminder when a phase has waited this many days, then again every this many days.", fallback: 3 },
  { kind: "auto_close_waiting", title: "Auto-close tickets waiting on someone", hint: "A ticket in a “waiting” status with no activity for this many days is closed (nightly).", fallback: 14 },
  { kind: "escalate_overdue", title: "Escalate overdue tickets", hint: "When a ticket is this many days past due, its assignee, team lead and managers hear about it once.", fallback: 1 },
] as const;

export default async function AutomationSettings() {
  const ctx = await requirePermission("settings.manage");
  const rows = await db.select().from(automationRules).where(eq(automationRules.orgId, ctx.orgId));
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackToSettings />
      <PageHeader title="Automation" description="Runs on the hourly and nightly schedules." />
      <SettingsForm title="Rules" action={saveAutomation}>
        {RULES.map((r) => {
          const row = rows.find((x) => x.kind === r.kind);
          return (
            <div key={r.kind} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox name={`${r.kind}-active`} defaultChecked={row?.isActive ?? true} /> {r.title}
                </label>
                <p className="mt-1 pl-6 text-xs text-muted-foreground">{r.hint}</p>
              </div>
              <label className="flex items-center gap-2 pl-6 text-sm sm:pl-0">
                <Input name={`${r.kind}-days`} type="number" min={0} max={365} defaultValue={row?.afterDays ?? r.fallback} className="w-20" aria-label={`${r.title}: days`} />
                days
              </label>
            </div>
          );
        })}
      </SettingsForm>
    </div>
  );
}
