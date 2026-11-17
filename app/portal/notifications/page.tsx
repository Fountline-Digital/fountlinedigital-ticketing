import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { NotificationsCard } from "@/app/(app)/dashboard/notifications-card";
import { requirePortal } from "@/lib/portal";
import { timeAgo } from "@/lib/time-ago";

export default async function PortalNotificationsPage() {
  const ctx = await requirePortal();
  const items = ctx.preview
    ? []
    : await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.recipientUserId, ctx.user.id), eq(notifications.orgId, ctx.orgId), eq(notifications.inApp, true)))
        .orderBy(desc(notifications.createdAt))
        .limit(100);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <NotificationsCard
        unread={items.filter((n) => !n.readAt).length}
        items={items.map((n) => ({ id: n.id, title: n.title, body: n.body, url: n.url, ago: timeAgo(n.createdAt), unread: !n.readAt }))}
      />
    </div>
  );
}
