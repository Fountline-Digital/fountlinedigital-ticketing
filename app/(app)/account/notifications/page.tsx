import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notificationPreferences } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { PERSONAL_EVENTS } from "@/lib/notification-events";
import { requireUser } from "@/lib/session";
import { PreferencesForm } from "./preferences-form";

export default async function MyNotificationsPage() {
  const { user, membership } = await requireUser();
  const saved = await db.select().from(notificationPreferences).where(eq(notificationPreferences.membershipId, membership.id));
  const prefs = Object.fromEntries(
    PERSONAL_EVENTS.map((e) => {
      const s = saved.find((p) => p.eventKey === e.key);
      return [e.key, { inApp: s?.inApp ?? true, email: s?.email ?? e.email }];
    }),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="My notifications" description={`Choose what reaches you in the app (the bell) and by email at ${user.email}.`} />
      <PreferencesForm
        events={PERSONAL_EVENTS.map((e) => ({ key: e.key, label: e.label, description: e.description }))}
        initial={prefs}
      />
    </div>
  );
}
