import "server-only";
import { and, asc, count, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { clients, packages, ticketStatuses, tickets } from "@/db/schema";

/** Done vs total tickets per project (cancelled tickets don't count). */
export async function projectProgress(projectIds: string[]) {
  const map = new Map<string, { done: number; total: number }>();
  if (projectIds.length === 0) return map;
  const rows = await db
    .select({ projectId: tickets.projectId, category: ticketStatuses.category, n: count() })
    .from(tickets)
    .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
    .where(and(inArray(tickets.projectId, projectIds), isNull(tickets.deletedAt)))
    .groupBy(tickets.projectId, ticketStatuses.category);
  for (const r of rows) {
    if (!r.projectId || r.category === "cancelled") continue;
    const cur = map.get(r.projectId) ?? { done: 0, total: 0 };
    cur.total += r.n;
    if (r.category === "done") cur.done += r.n;
    map.set(r.projectId, cur);
  }
  return map;
}

/** Choices for the New project dialog: active clients and sellable packages. */
export async function projectOptions(orgId: string) {
  const clientRows = await db
    .select({ value: clients.id, label: clients.name })
    .from(clients)
    .where(and(eq(clients.orgId, orgId), eq(clients.status, "active"), isNull(clients.deletedAt)))
    .orderBy(asc(clients.name));
  const packageRows = await db
    .select({ id: packages.id, key: packages.key, name: packages.name })
    .from(packages)
    .where(and(eq(packages.orgId, orgId), eq(packages.status, "active"), isNotNull(packages.currentVersionId)))
    .orderBy(asc(packages.key));
  return {
    clients: clientRows,
    packages: packageRows.map((p) => ({ value: p.id, label: `${p.name} (${p.key})`, name: p.name })),
  };
}
