import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { packageVersions, packages, serviceLines, tiers } from "@/db/schema";
import { getDraft } from "@/lib/packages";
import { requirePermission } from "@/lib/session";
import { PackageStatusBadge } from "../status-badge";
import { PublishBar, StatusActions } from "./package-actions";
import { PackageTabs } from "./tabs";

export default async function PackageLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("packages.manage");

  const [row] = await db
    .select({ pkg: packages, lineName: serviceLines.name, tierName: tiers.name, liveVersion: packageVersions.version })
    .from(packages)
    .innerJoin(serviceLines, eq(serviceLines.id, packages.serviceLineId))
    .innerJoin(tiers, eq(tiers.id, packages.tierId))
    .leftJoin(packageVersions, eq(packageVersions.id, packages.currentVersionId))
    .where(and(eq(packages.id, id), eq(packages.orgId, ctx.orgId)));
  if (!row) notFound();
  const { pkg } = row;
  const draft = await getDraft(pkg.id);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/packages" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Packages
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{pkg.name}</h1>
            <PackageStatusBadge status={pkg.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{pkg.key}</span> · {row.lineName} · {row.tierName}
            {row.liveVersion && (
              <>
                {" "}
                · live version <span className="font-mono">v{row.liveVersion}</span>
              </>
            )}
          </p>
        </div>
        <StatusActions packageId={pkg.id} status={pkg.status} hasVersion={Boolean(pkg.currentVersionId)} />
      </div>

      {draft && <PublishBar packageId={pkg.id} version={draft.version} packageKey={pkg.key} />}

      <PackageTabs packageId={pkg.id} />

      {children}
    </div>
  );
}
