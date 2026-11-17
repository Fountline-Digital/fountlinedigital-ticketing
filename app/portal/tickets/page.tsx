import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { portalOptions, requirePortal } from "@/lib/portal";
import { portalTickets } from "@/lib/portal-queries";
import { timeAgo } from "@/lib/time-ago";
import { StatusDot } from "../status-dot";

export default async function PortalTicketsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  const closed = show === "closed";
  const ctx = await requirePortal();
  const opts = portalOptions(ctx.org);
  const rows = await portalTickets(ctx, { open: !closed, requestsOnly: true });
  const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: ctx.org.timezone });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Requests</h1>
          <p className="text-muted-foreground">What you&apos;ve asked us for. Anything waiting on you is at the top. Planned project work is on each project&apos;s page.</p>
        </div>
        <Link href="/portal/requests/new" className={buttonVariants()}>
          <Plus /> New request
        </Link>
      </div>
      <div className="flex gap-2" role="group" aria-label="Show">
        {[
          { href: "/portal/tickets", label: "Open", on: !closed },
          { href: "/portal/tickets?show=closed", label: "Closed", on: closed },
        ].map((t) => (
          <Link
            key={t.label}
            href={t.href}
            aria-current={t.on ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${t.on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <Card>
        <CardContent className="space-y-2">
          {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{closed ? "Nothing closed yet." : "Nothing open right now."}</p>}
          {rows.map(({ t, statusName, statusColor, category, projectName }) => (
            <Link key={t.id} href={`/portal/tickets/${t.key}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 transition-colors hover:bg-muted">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{t.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {t.key}
                  {projectName && ` · ${projectName}`}
                  {opts.showDueDates && t.dueAt && ` · due ${dateFmt.format(t.dueAt)}`} · updated {timeAgo(t.updatedAt)}
                </span>
              </span>
              {category === "waiting" && !closed && <Badge>Waiting on you</Badge>}
              <StatusDot name={statusName} color={statusColor} />
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
