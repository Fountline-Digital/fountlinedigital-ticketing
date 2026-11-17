import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notificationPreferences } from "@/db/schema";
import { PreferencesForm } from "@/app/(app)/account/notifications/preferences-form";
import { CLIENT_EVENTS } from "@/lib/notification-events";
import { requirePortal } from "@/lib/portal";

export default async function PortalNotificationSettings() {
  const ctx = await requirePortal();
  const saved = ctx.preview ? [] : await db.select().from(notificationPreferences).where(eq(notificationPreferences.membershipId, ctx.membershipId));
  const prefs = Object.fromEntries(
    CLIENT_EVENTS.map((e) => {
      const s = saved.find((p) => p.eventKey === e.key);
      return [e.key, { inApp: s?.inApp ?? true, email: s?.email ?? e.email }];
    }),
  );
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Notification settings</h1>
        <p className="text-muted-foreground">Choose what reaches you here and by email{ctx.preview ? "" : ` at ${ctx.user.email}`}.</p>
      </div>
      <PreferencesForm events={CLIENT_EVENTS.map((e) => ({ key: e.key, label: e.label, description: e.description }))} initial={prefs} readOnly={Boolean(ctx.preview)} />
    </div>
  );
}
