import { and, asc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { savedFilters } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { can, type Role } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { NewTicketDialog } from "./new-ticket-dialog";
import { filterOptions, findTickets, parseFilters } from "./query";
import { TicketBoard } from "./ticket-board";
import { TicketTable } from "./ticket-table";
import { TicketToolbar } from "./ticket-toolbar";

export default async function TicketsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { user, membership } = await requireUser();
  const orgId = membership.orgId;
  const viewAll = await can(orgId, membership.role as Role, "tickets.view_all");
  if (membership.role === "client") return null;

  const view = sp.view === "board" ? "board" : "list";
  const filters = parseFilters(sp);
  const [rows, options] = await Promise.all([
    findTickets({ orgId, membershipId: membership.id, userId: user.id, viewAll, filters, board: view === "board", limit: view === "board" ? 400 : 200 }),
    filterOptions(orgId, viewAll, membership.id),
  ]);

  const views = await db
    .select()
    .from(savedFilters)
    .where(and(eq(savedFilters.orgId, orgId), or(eq(savedFilters.ownerMembershipId, membership.id), eq(savedFilters.isShared, true))))
    .orderBy(asc(savedFilters.name));

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Tickets"
        description={viewAll ? "All tickets across clients and projects." : "Tickets on your projects, assigned to you, or created by you."}
        actions={
          <NewTicketDialog
            types={options.types.filter((t) => t.kind !== "lead").map((t) => ({ value: t.value, label: t.label }))}
            defaultTypeId={options.types.find((t) => t.kind === "internal")?.value}
          />
        }
      />

      <TicketToolbar
        view={view}
        filters={filters}
        options={options}
        canShare={membership.role === "admin" || membership.role === "manager"}
        savedViews={views.map((v) => ({
          id: v.id,
          name: v.name,
          view: v.view === "board" ? "board" : "list",
          filters: v.filters as Record<string, string>,
          shared: v.isShared,
          mine: v.ownerMembershipId === membership.id,
        }))}
      />

      {view === "board" ? (
        <TicketBoard statuses={options.statuses.filter((s) => s.category !== "cancelled")} tickets={rows} />
      ) : (
        <TicketTable tickets={rows} limitReached={rows.length >= 200} />
      )}
    </div>
  );
}
