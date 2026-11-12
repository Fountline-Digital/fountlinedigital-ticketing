import Link from "next/link";
import { and, asc, count, eq, isNull, ne } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { db } from "@/db";
import { clientContacts, clients, projects } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/lib/session";
import { NewClientDialog } from "./new-client-dialog";

export default async function ClientsPage() {
  const ctx = await requirePermission("clients.view");
  const canManage = await can(ctx.orgId, ctx.role, "clients.manage");

  const rows = await db
    .select()
    .from(clients)
    .where(and(eq(clients.orgId, ctx.orgId), isNull(clients.deletedAt)))
    .orderBy(asc(clients.name));

  const contactCounts = await db
    .select({ clientId: clientContacts.clientId, n: count() })
    .from(clientContacts)
    .where(and(eq(clientContacts.orgId, ctx.orgId), isNull(clientContacts.deletedAt)))
    .groupBy(clientContacts.clientId);
  const projectCounts = await db
    .select({ clientId: projects.clientId, n: count() })
    .from(projects)
    .where(and(eq(projects.orgId, ctx.orgId), isNull(projects.deletedAt), ne(projects.status, "archived"), ne(projects.status, "cancelled")))
    .groupBy(projects.clientId);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Clients" description="The businesses you work for." actions={canManage && <NewClientDialog />} />
      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No clients yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Contacts</TableHead>
                  <TableHead className="hidden md:table-cell">Open projects</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id} className="relative">
                    <TableCell>
                      <Link href={`/clients/${c.id}`} className="font-medium after:absolute after:inset-0">
                        {c.name}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">{c.key}</div>
                    </TableCell>
                    <TableCell>{c.status === "active" ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Archived</Badge>}</TableCell>
                    <TableCell className="hidden md:table-cell">{contactCounts.find((x) => x.clientId === c.id)?.n ?? 0}</TableCell>
                    <TableCell className="hidden md:table-cell">{projectCounts.find((x) => x.clientId === c.id)?.n ?? 0}</TableCell>
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
