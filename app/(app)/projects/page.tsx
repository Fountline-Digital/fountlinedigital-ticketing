import Link from "next/link";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { db } from "@/db";
import { clients, packageVersions, packages, projectMembers, projects } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can } from "@/lib/permissions";
import { projectOptions, projectProgress } from "@/lib/project-queries";
import { requireUser } from "@/lib/session";
import type { Role } from "@/lib/permissions";
import { NewProjectDialog } from "./new-project-dialog";
import { ProgressBar } from "./progress-bar";
import { ProjectStatusBadge } from "./status-badge";

export default async function ProjectsPage() {
  const { membership } = await requireUser();
  const orgId = membership.orgId;
  const role = membership.role as Role;
  const seeAll = await can(orgId, role, "projects.view_all");
  const canCreate = await can(orgId, role, "projects.manage");

  // Workers and contractors only see projects they're on.
  const memberOf = seeAll
    ? null
    : (await db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.membershipId, membership.id))).map((r) => r.id);

  const rows =
    memberOf && memberOf.length === 0
      ? []
      : await db
          .select({ p: projects, clientName: clients.name, packageKey: packages.key, version: packageVersions.version })
          .from(projects)
          .innerJoin(clients, eq(clients.id, projects.clientId))
          .innerJoin(packageVersions, eq(packageVersions.id, projects.packageVersionId))
          .innerJoin(packages, eq(packages.id, packageVersions.packageId))
          .where(and(eq(projects.orgId, orgId), isNull(projects.deletedAt), memberOf ? inArray(projects.id, memberOf) : undefined))
          .orderBy(desc(projects.createdAt));

  const progress = await projectProgress(rows.map((r) => r.p.id));
  const options = canCreate ? await projectOptions(orgId) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Projects"
        description={seeAll ? "Every client project." : "Projects you're on."}
        actions={options && <NewProjectDialog clients={options.clients} packages={options.packages} />}
      />
      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No projects yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead className="hidden md:table-cell">Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden w-48 lg:table-cell">Progress</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ p, clientName, packageKey, version }) => (
                  <TableRow key={p.id} className="relative">
                    <TableCell>
                      <Link href={`/projects/${p.id}`} className="font-medium after:absolute after:inset-0">
                        {p.name}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">
                        {p.key} · {packageKey}-v{version}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{clientName}</TableCell>
                    <TableCell>
                      <ProjectStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <ProgressBar done={progress.get(p.id)?.done ?? 0} total={progress.get(p.id)?.total ?? 0} />
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
