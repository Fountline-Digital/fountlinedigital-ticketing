"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { markAllNotificationsRead, markNotificationRead } from "@/app/(app)/notifications/actions";

type Item = { id: string; title: string; body: string | null; url: string | null; ago: string; unread: boolean };
type Data = { unread: number; items: Item[] };

const POLL_MS = 60_000;

export function NotificationBell({
  initial,
  links = { all: "/notifications", settings: "/account/notifications" },
}: {
  initial: Data;
  links?: { all: string; settings: string };
}) {
  const router = useRouter();
  const [data, setData] = useState<Data>(initial);
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      /* offline: try again next time */
    }
  }, []);

  // Check every minute while the tab is visible, and right away when coming back to it
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && void load();
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  const open = (n: Item) =>
    start(async () => {
      if (n.unread) await markNotificationRead(n.id);
      await load();
      if (n.url) router.push(n.url);
    });

  return (
    <DropdownMenu onOpenChange={(o: boolean) => o && void load()}>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="relative" aria-label={data.unread ? `Notifications, ${data.unread} unread` : "Notifications"} />}
      >
        <Bell />
        {data.unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {data.unread > 99 ? "99+" : data.unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between">
            <span className="text-foreground">Notifications</span>
            {data.unread > 0 && (
              <button
                type="button"
                className="text-xs font-normal text-primary hover:underline disabled:opacity-50"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await markAllNotificationsRead();
                    await load();
                  })
                }
              >
                Mark all read
              </button>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto">
          {data.items.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>}
          {data.items.map((n) => (
            <DropdownMenuItem key={n.id} onClick={() => open(n)} className="items-start gap-2 py-2">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.unread ? "bg-primary" : "bg-transparent")} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm", n.unread ? "font-medium text-foreground" : "text-muted-foreground")}>{n.title}</span>
                {n.body && <span className="block truncate text-xs text-muted-foreground">{n.body}</span>}
                <span className="block text-xs text-muted-foreground">{n.ago}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between px-2 py-1">
          <Link href={links.all} className="text-sm text-primary hover:underline">
            See all
          </Link>
          <Link href={links.settings} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Settings className="size-3.5" /> Settings
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
