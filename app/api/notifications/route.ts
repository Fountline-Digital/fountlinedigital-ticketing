import { NextResponse } from "next/server";
import { recentNotifications } from "@/lib/dashboard";
import { requireUser } from "@/lib/session";
import { timeAgo } from "@/lib/time-ago";

// The header bell polls this for new notifications.
export async function GET() {
  const { user, membership } = await requireUser();
  const { items, unread } = await recentNotifications(user.id, membership.orgId, 10);
  return NextResponse.json(
    {
      unread,
      items: items.map((n) => ({ id: n.id, title: n.title, body: n.body, url: n.url, ago: timeAgo(n.createdAt), unread: !n.readAt })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
