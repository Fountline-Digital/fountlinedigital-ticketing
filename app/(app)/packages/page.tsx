import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { db } from "@/db";
import { packageVersions, packages, serviceLines, tiers } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/session";
import { NewPackageDialog } from "./new-package-dialog";
import { PackageStatusBadge } from "./status-badge";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function PackagesPage() {
  const ctx = await requirePermission("packages.manage");

  const lines = await db.select().from(serviceLines).where(eq(serviceLines.orgId, ctx.orgId)).orderBy(asc(serviceLines.sortOrder));
  const tierRows = await db.select().from(tiers).where(eq(tiers.orgId, ctx.orgId)).orderBy(asc(tiers.sortOrder));

  const rows = await db
    .select({
      id: packages.id,
      key: packages.key,
      name: packages.name,
      status: packages.status,
      priceCents: packages.priceCents,
      serviceLineId: packages.serviceLineId,
      tierId: packages.tierId,
      currentVersion: packageVersions.version,
    })
    .from(packages)
    .leftJoin(packageVersions, eq(packageVersions.id, packages.currentVersionId))
    .where(eq(packages.orgId, ctx.orgId));

  const drafts = await db
    .select({ packageId: packageVersions.packageId, version: packageVersions.version })
    .from(packageVersions)
    .where(and(eq(packageVersions.orgId, ctx.orgId), isNull(packageVersions.publishedAt)));
  const draftByPackage = new Map(drafts.map((d) => [d.packageId, d.version] as const));

  const tierOrder = new Map(tierRows.map((t, i) => [t.id, i] as const));
  const tierName = new Map(tierRows.map((t) => [t.id, t.name] as const));

  // Service line + tier combinations that don't have a package yet
  const existing = new Set(rows.map((r) => `${r.serviceLineId}:${r.tierId}`));
  const missing = lines.flatMap((l) =>
    tierRows.filter((t) => !existing.has(`${l.id}:${t.id}`)).map((t) => ({ serviceLineId: l.id, tierId: t.id, label: `${l.name} ${t.name}` })),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Packages"
        description="What you sell. Each package has settings and a project template; changes go live when you publish."
        actions={<NewPackageDialog options={missing} />}
      />

      {lines.map((line) => {
        const items = rows
          .filter((r) => r.serviceLineId === line.id)
          .sort((a, b) => (tierOrder.get(a.tierId) ?? 0) - (tierOrder.get(b.tierId) ?? 0));
        return (
          <Card key={line.id}>
            <CardHeader>
              <CardTitle>{line.name}</CardTitle>
              <CardDescription>{line.code}</CardDescription>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No packages yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Package</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden md:table-cell">Price</TableHead>
                      <TableHead className="hidden md:table-cell">Version</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((p) => {
                      const draft = draftByPackage.get(p.id);
                      return (
                        <TableRow key={p.id} className="relative">
                          <TableCell>
                            <Link href={`/packages/${p.id}`} className="font-medium after:absolute after:inset-0">
                              {p.name}
                            </Link>
                            <div className="font-mono text-xs text-muted-foreground">{p.key}</div>
                          </TableCell>
                          <TableCell>{tierName.get(p.tierId)}</TableCell>
                          <TableCell>
                            <PackageStatusBadge status={p.status} />
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {p.priceCents === null ? <span className="text-muted-foreground">Not set</span> : money.format(p.priceCents / 100)}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <span className="font-mono text-xs">v{p.currentVersion ?? "—"}</span>
                            {draft && (
                              <Badge variant="outline" className="ml-2">
                                Draft v{draft}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <ChevronRight className="size-4 text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
