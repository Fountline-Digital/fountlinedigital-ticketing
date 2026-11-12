import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { ArrowLeft, Globe, Phone } from "lucide-react";
import { db } from "@/db";
import { clientContacts, clients, packageVersions, packages, projects } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can } from "@/lib/permissions";
import { projectProgress, projectOptions } from "@/lib/project-queries";
import { requirePermission } from "@/lib/session";
import { NewProjectDialog } from "../../projects/new-project-dialog";
import { ProjectStatusBadge } from "../../projects/status-badge";
import { ProgressBar } from "../../projects/progress-bar";
import { ContactDialog, ContactRowActions, EditClientDialog } from "./client-dialogs";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("clients.view");
  const canManage = await can(ctx.orgId, ctx.role, "clients.manage");
  const canCreateProject = await can(ctx.orgId, ctx.role, "projects.manage");

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.orgId, ctx.orgId), isNull(clients.deletedAt)));
  if (!client) notFound();

  const contacts = await db
    .select()
    .from(clientContacts)
    .where(and(eq(clientContacts.clientId, client.id), isNull(clientContacts.deletedAt)))
    .orderBy(desc(clientContacts.isPrimary), asc(clientContacts.name));

  const clientProjects = await db
    .select({ p: projects, packageKey: packages.key, version: packageVersions.version })
    .from(projects)
    .innerJoin(packageVersions, eq(packageVersions.id, projects.packageVersionId))
    .innerJoin(packages, eq(packages.id, packageVersions.packageId))
    .where(and(eq(projects.clientId, client.id), isNull(projects.deletedAt)))
    .orderBy(desc(projects.createdAt));
  const progress = await projectProgress(clientProjects.map((r) => r.p.id));
  const options = canCreateProject ? await projectOptions(ctx.orgId) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/clients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Clients
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
            {client.status === "archived" && <Badge variant="outline">Archived</Badge>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="font-mono">{client.key}</span>
            {client.website && (
              <a href={client.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                <Globe className="size-3.5" />
                {client.website.replace(/^https?:\/\//, "")}
              </a>
            )}
            {client.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3.5" />
                {client.phone}
              </span>
            )}
          </div>
        </div>
        {canManage && (
          <EditClientDialog
            client={{ id: client.id, name: client.name, website: client.website ?? "", phone: client.phone ?? "", notes: client.notes ?? "", status: client.status }}
          />
        )}
      </div>

      {client.notes && (
        <Card>
          <CardHeader>
            <CardDescription>Internal notes</CardDescription>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{client.notes}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
          <CardDescription>{clientProjects.length === 0 ? "No projects yet." : `${clientProjects.length} total`}</CardDescription>
          {options && (
            <CardAction>
              <NewProjectDialog clients={options.clients} packages={options.packages} defaultClientId={client.id} />
            </CardAction>
          )}
        </CardHeader>
        {clientProjects.length > 0 && (
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden w-48 md:table-cell">Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientProjects.map(({ p, packageKey, version }) => (
                  <TableRow key={p.id} className="relative">
                    <TableCell>
                      <Link href={`/projects/${p.id}`} className="font-medium after:absolute after:inset-0">
                        {p.name}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">
                        {p.key} · {packageKey}-v{version}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ProjectStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <ProgressBar done={progress.get(p.id)?.done ?? 0} total={progress.get(p.id)?.total ?? 0} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contacts</CardTitle>
          <CardDescription>Only Primary and Approver contacts can approve phases and change requests.</CardDescription>
          {canManage && (
            <CardAction>
              <ContactDialog clientId={client.id} />
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contacts yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="hidden md:table-cell">Portal</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.email}
                        {c.phone ? ` · ${c.phone}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {c.isPrimary && <Badge>Primary</Badge>}
                        {c.isApprover && <Badge variant="secondary">Approver</Badge>}
                        {c.isBilling && <Badge variant="outline">Billing</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {c.userId ? <Badge variant="secondary">Has login</Badge> : <span className="text-sm text-muted-foreground">Not invited</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage && (
                        <ContactRowActions
                          clientId={client.id}
                          contact={{
                            id: c.id,
                            name: c.name,
                            email: c.email,
                            phone: c.phone ?? "",
                            isPrimary: c.isPrimary,
                            isApprover: c.isApprover,
                            isBilling: c.isBilling,
                            hasLogin: Boolean(c.userId),
                          }}
                        />
                      )}
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
