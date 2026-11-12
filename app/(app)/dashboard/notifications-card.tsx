"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { markAllNotificationsRead, markNotificationRead } from "../notifications/actions";

type Item = { id: string; title: string; body: string | null; url: string | null; ago: string; unread: boolean };

export function NotificationsCard({ items, unread }: { items: Item[]; unread: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4" />
          Notifications
        </CardTitle>
        <CardDescription>{unread > 0 ? `${unread} unread` : "You're all caught up."}</CardDescription>
        {unread > 0 && (
          <CardAction>
            <Button variant="ghost" size="xs" disabled={pending} onClick={() => start(() => markAllNotificationsRead())}>
              Mark all read
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Mentions and assignments show up here.</p>
        ) : (
          <ul className="divide-y">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 py-2 text-left hover:bg-muted/50"
                  onClick={() =>
                    start(async () => {
                      if (n.unread) await markNotificationRead(n.id);
                      if (n.url) router.push(n.url);
                    })
                  }
                >
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.unread ? "bg-primary" : "bg-transparent")} aria-label={n.unread ? "Unread" : undefined} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", n.unread && "font-medium")}>{n.title}</span>
                    {n.body && <span className="block truncate text-xs text-muted-foreground">{n.body}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{n.ago}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
