import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { businessHours, holidays } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/session";
import { saveHours } from "../actions";
import { BackToSettings } from "../back";
import { SettingsForm } from "../settings-form";
import { DayRow, Holidays } from "./hours-client";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function HoursSettings() {
  const ctx = await requirePermission("settings.manage");
  const hours = await db.select().from(businessHours).where(eq(businessHours.orgId, ctx.orgId));
  const days = await db.select().from(holidays).where(eq(holidays.orgId, ctx.orgId)).orderBy(asc(holidays.date));
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackToSettings />
      <PageHeader title="Business hours & holidays" description="Response targets only count these hours, in your organization's time zone." />
      <SettingsForm title="Weekly hours" action={saveHours}>
        <div className="grid gap-2">
          {DAYS.map((name, d) => {
            const h = hours.find((x) => x.dayOfWeek === d);
            return <DayRow key={d} day={d} name={name} open={Boolean(h)} opens={h?.opensAt.slice(0, 5) ?? "09:00"} closes={h?.closesAt.slice(0, 5) ?? "17:00"} />;
          })}
        </div>
      </SettingsForm>
      <Holidays upcoming={days.filter((h) => String(h.date) >= today).map((h) => ({ id: h.id, date: String(h.date), name: h.name }))} pastCount={days.filter((h) => String(h.date) < today).length} />
    </div>
  );
}
