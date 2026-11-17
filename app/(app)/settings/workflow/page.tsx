import Link from "next/link";
import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { leadStages, lostReasons, phaseNames, priorities, serviceLines, ticketStatuses, ticketTypes, tickets, tiers } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { LIST_KEYS, LISTS, type ListKey } from "@/lib/lookups";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { BackToSettings } from "../back";
import { LookupEditor } from "./lookup-editor";

const TABLES = { statuses: ticketStatuses, types: ticketTypes, priorities, stages: leadStages, lostReasons, phaseNames, serviceLines, tiers } as const;

/** How many tickets use each item (shown so people know what retiring affects). */
async function usage(list: ListKey) {
  const col =
    list === "statuses" ? tickets.statusId : list === "types" ? tickets.ticketTypeId : list === "priorities" ? tickets.priorityId : list === "stages" ? tickets.leadStageId : list === "lostReasons" ? tickets.lostReasonId : null;
  if (!col) return new Map<string, number>();
  const rows = await db.select({ id: col, n: count() }).from(tickets).groupBy(col);
  return new Map<string, number>(rows.filter((r) => r.id).map((r) => [r.id as string, Number(r.n)]));
}

export default async function WorkflowSettings({ searchParams }: { searchParams: Promise<{ list?: string }> }) {
  const { list: raw } = await searchParams;
  const ctx = await requirePermission("settings.manage");
  const list: ListKey = LIST_KEYS.includes(raw as ListKey) ? (raw as ListKey) : "statuses";
  const t = TABLES[list] as unknown as typeof ticketStatuses;
  const items = (await db.select().from(t).where(eq(t.orgId, ctx.orgId)).orderBy(asc(t.sortOrder))) as unknown as Record<string, unknown>[];
  const used = await usage(list);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BackToSettings />
      <PageHeader title="Workflow lists" description="Rename, recolor, reorder or retire. Things in use are retired rather than deleted, so old tickets keep their values." />
      <nav className="flex flex-wrap gap-2" aria-label="Lists">
        {LIST_KEYS.map((k) => (
          <Link
            key={k}
            href={`/settings/workflow?list=${k}`}
            aria-current={k === list ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1 text-sm", k === list ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {LISTS[k].label}
          </Link>
        ))}
      </nav>
      <LookupEditor
        key={list}
        list={list}
        items={items.map((r) => ({ ...r, id: r.id as string, name: r.name as string, isActive: r.isActive as boolean, used: used.get(r.id as string) ?? 0 }))}
      />
    </div>
  );
}
