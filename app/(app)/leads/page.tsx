import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { memberships, tickets, users } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { canSeeLeads, stagesAndReasons } from "@/lib/leads";
import type { Role } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { timeAgo } from "@/lib/time-ago";
import { MoveLead } from "./move-lead";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const { mine } = await searchParams;
  const u = await requireUser();
  const ctx = { ...u, orgId: u.membership.orgId, role: u.membership.role as Role };
  if (!(await canSeeLeads(ctx))) redirect("/dashboard?error=forbidden");

  const { stages, reasons } = await stagesAndReasons(ctx.orgId);
  const recent = new Date(Date.now() - 30 * 86_400_000);
  const rows = await db
    .select({ t: tickets, assigneeName: users.name, assigneeEmail: users.email })
    .from(tickets)
    .leftJoin(memberships, eq(memberships.id, tickets.assigneeMembershipId))
    .leftJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(tickets.orgId, ctx.orgId),
        isNull(tickets.deletedAt),
        isNotNull(tickets.leadStageId),
        mine ? eq(tickets.assigneeMembershipId, ctx.membership.id) : undefined,
        // Won/Lost columns only show the last 30 days
        or(isNull(tickets.closedAt), gte(tickets.closedAt, recent)),
      ),
    )
    .orderBy(desc(tickets.createdAt))
    .limit(500);

  const options = stages.map((s) => ({ value: s.id, label: s.name, kind: s.kind }));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Website inquiries and other leads. Won and Lost show the last 30 days."
        actions={
          <Link href={mine ? "/leads" : "/leads?mine=1"} className="text-sm text-primary hover:underline">
            {mine ? "Show everyone's" : "Only mine"}
          </Link>
        }
      />
      <div className="flex snap-x gap-4 overflow-x-auto pb-4">
        {stages.map((s) => {
          const cards = rows.filter((r) => r.t.leadStageId === s.id);
          return (
            <section key={s.id} aria-label={s.name} className="w-72 shrink-0 snap-start space-y-2">
              <h2 className="flex items-center justify-between px-1 text-sm font-medium">
                {s.name}
                <Badge variant={s.kind === "open" ? "outline" : "secondary"}>{cards.length}</Badge>
              </h2>
              <div className="space-y-2">
                {cards.length === 0 && <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">Empty</p>}
                {cards.map(({ t, assigneeName, assigneeEmail }) => {
                  const fd = (t.formData ?? {}) as Record<string, unknown>;
                  const asText = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").join(", ") : typeof v === "string" ? v : "");
                  const service = [asText(fd.service), asText(fd.package)].filter(Boolean).join(" · ");
                  return (
                    <div key={t.id} className="space-y-1.5 rounded-lg border bg-card p-3">
                      <Link href={`/tickets/${t.key}`} className="block text-sm font-medium hover:underline">
                        {t.leadContact?.name ?? t.title}
                        {t.leadContact?.company && <span className="font-normal text-muted-foreground"> · {t.leadContact.company}</span>}
                      </Link>
                      {service && <p className="truncate text-xs text-muted-foreground">{service}</p>}
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{t.key}</span> · {timeAgo(t.createdAt)} · {assigneeName || assigneeEmail || "Unassigned"}
                      </p>
                      {t.clientId && <Badge variant="secondary">Converted</Badge>}
                      <MoveLead ticketId={t.id} stageId={s.id} stages={options} reasons={reasons.map((r) => ({ value: r.id, label: r.name }))} />
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
