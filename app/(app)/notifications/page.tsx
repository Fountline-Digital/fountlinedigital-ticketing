import Link from "next/link";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/session";
import { timeAgo } from "@/lib/time-ago";
import { NotificationsCard } from "../dashboard/notifications-card";

const PAGE = 50;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ unread?: string; page?: string }> }) {
  const sp = await searchParams;
  const { user, membership } = await requireUser();
  const onlyUnread = sp.unread === "1";
  const page = Math.max(1, Number(sp.page) || 1);

  const mine = and(
    eq(notifications.recipientUserId, user.id),
    eq(notifications.orgId, membership.orgId),
    eq(notifications.inApp, true),
    onlyUnread ? isNull(notifications.readAt) : undefined,
  );
  const [items, [total], [unread]] = await Promise.all([
    db.select().from(notifications).where(mine).orderBy(desc(notifications.createdAt)).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ n: count() }).from(notifications).where(mine),
    db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.recipientUserId, user.id), eq(notifications.orgId, membership.orgId), eq(notifications.inApp, true), isNull(notifications.readAt))),
  ]);
  const pages = Math.max(1, Math.ceil((total?.n ?? 0) / PAGE));
  const href = (p: number, u = onlyUnread) => `/notifications?${new URLSearchParams({ ...(u ? { unread: "1" } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Notifications"
        description="Everything sent to you in the app."
        actions={
          <Link href="/account/notifications" className={buttonVariants({ variant: "outline" })}>
            Settings
          </Link>
        }
      />
      <div className="flex gap-2 text-sm">
        <Link href={href(1, false)} className={onlyUnread ? "text-muted-foreground hover:text-foreground" : "font-medium text-primary"}>
          All
        </Link>
        <span className="text-muted-foreground">·</span>
        <Link href={href(1, true)} className={onlyUnread ? "font-medium text-primary" : "text-muted-foreground hover:text-foreground"}>
          Unread ({unread?.n ?? 0})
        </Link>
      </div>
      <NotificationsCard
        title={onlyUnread ? "Unread" : "All notifications"}
        unread={unread?.n ?? 0}
        items={items.map((n) => ({ id: n.id, title: n.title, body: n.body, url: n.url, ago: timeAgo(n.createdAt), unread: !n.readAt }))}
        footer={
          pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              {page > 1 ? <Link href={href(page - 1)} className="text-primary hover:underline">Newer</Link> : <span />}
              <span className="text-muted-foreground">
                Page {page} of {pages}
              </span>
              {page < pages ? <Link href={href(page + 1)} className="text-primary hover:underline">Older</Link> : <span />}
            </div>
          )
        }
      />
    </div>
  );
}
