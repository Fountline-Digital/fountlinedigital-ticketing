import Link from "next/link";
import { asc, count, eq } from "drizzle-orm";
import { Download } from "lucide-react";
import { db } from "@/db";
import { auditLog, memberships, organizations, users } from "@/db/schema";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { AUDIT_AREAS, auditRows, auditWhere, entityHref, type AuditFilters } from "@/lib/audit-query";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { requirePermission } from "@/lib/session";

const PAGE = 100;
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground";

function Diff({ before, after }: { before?: Record<string, unknown>; after?: Record<string, unknown> }) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  if (keys.length === 0) return null;
  const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "string" ? v : JSON.stringify(v));
  return (
    <ul className="space-y-0.5">
      {keys.map((k) => (
        <li key={k}>
          <span className="text-muted-foreground">{k}:</span> {before && k in before && <span className="line-through opacity-60">{show(before[k])}</span>}
          {before && k in before && " → "}
          {show(after?.[k])}
        </li>
      ))}
    </ul>
  );
}

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<AuditFilters> }) {
  const f = await searchParams;
  const ctx = await requirePermission("audit.view");
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  const page = Math.max(1, Number(f.page) || 1);

  const [rows, [total], people] = await Promise.all([
    auditRows(ctx.orgId, f, PAGE, (page - 1) * PAGE),
    db.select({ n: count() }).from(auditLog).where(auditWhere(ctx.orgId, f)),
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, ctx.orgId))
      .orderBy(asc(users.name)),
  ]);
  const pages = Math.max(1, Math.ceil((total?.n ?? 0) / PAGE));
  const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "medium", timeZone: org.timezone });

  const params = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...f, ...extra })) if (v && k !== "page") p.set(k, v);
    if (extra.page && extra.page !== "1") p.set("page", extra.page);
    return p.toString();
  };
  const filtered = Boolean(f.q || f.actor || f.area || f.from || f.to);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Audit log"
        description={`Every action by every person and by the system. Entries can't be edited or deleted. After ${org.settings.auditHotDays ?? 90} days they move to file storage (R2, folder ${org.keyPrefix.toLowerCase()}/_audit).`}
        actions={
          <a href={`/api/audit/export?${params({})}`} className={buttonVariants({ variant: "outline" })}>
            <Download /> Export CSV
          </a>
        }
      />

      <Card>
        <CardContent>
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_auto_auto_auto] lg:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="q">Search</Label>
              <Input id="q" name="q" defaultValue={f.q ?? ""} placeholder="FDT-1042, ticket.update, a file name…" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="actor">Who</Label>
              <select id="actor" name="actor" defaultValue={f.actor ?? ""} className={selectClass}>
                <option value="">Anyone</option>
                <option value="system">System</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="area">Area</Label>
              <select id="area" name="area" defaultValue={f.area ?? ""} className={selectClass}>
                <option value="">Everything</option>
                {Object.entries(AUDIT_AREAS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="from">From</Label>
              <Input id="from" name="from" type="date" defaultValue={f.from ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="to">To</Label>
              <Input id="to" name="to" type="date" defaultValue={f.to ?? ""} />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Filter</Button>
              {filtered && (
                <Link href="/settings/audit" className={buttonVariants({ variant: "ghost" })}>
                  Clear
                </Link>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        {(total?.n ?? 0).toLocaleString()} entr{total?.n === 1 ? "y" : "ies"}. Dates are in UTC for filtering; times below are {org.timezone}.
      </p>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>On</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Nothing matches.
                  </TableCell>
                </TableRow>
              )}
              {rows.map(({ a, name, email }) => {
                const href = entityHref(a);
                const target = a.entityKey ?? a.entityType ?? "";
                const hasDetails = Boolean(a.changes || a.metadata || a.ipAddress);
                return (
                  <TableRow key={a.id} className="align-top">
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmt.format(a.createdAt)}</TableCell>
                    <TableCell className="text-sm">
                      {a.actorKind === "system" ? "System" : name || email || "Unknown"}
                      {a.actorRole && <span className="block text-xs text-muted-foreground">{ROLE_LABELS[a.actorRole as Role]}</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{a.action}</TableCell>
                    <TableCell className="text-sm">
                      {href ? (
                        <Link href={href} className="font-mono text-xs hover:underline">
                          {target}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">{target}</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-md text-xs">
                      {hasDetails && (
                        <details>
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Show</summary>
                          <div className="mt-2 space-y-2 break-words">
                            <Diff before={a.changes?.before} after={a.changes?.after} />
                            {a.metadata && <pre className="whitespace-pre-wrap rounded bg-muted p-2 font-mono text-[11px]">{JSON.stringify(a.metadata, null, 2)}</pre>}
                            {a.ipAddress && (
                              <p className="text-muted-foreground">
                                {a.ipAddress} · {a.userAgent}
                              </p>
                            )}
                          </div>
                        </details>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={`/settings/audit?${params({ page: String(page - 1) })}`} className="text-primary hover:underline">Newer</Link> : <span />}
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={`/settings/audit?${params({ page: String(page + 1) })}`} className="text-primary hover:underline">Older</Link> : <span />}
        </div>
      )}
    </div>
  );
}
