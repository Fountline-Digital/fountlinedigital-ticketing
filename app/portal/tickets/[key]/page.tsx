import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { comments, memberships, projects, ticketStatuses, users } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FilesCard } from "@/components/files/files-card";
import { listFiles } from "@/lib/file-access";
import { portalOptions, portalTicket, requirePortal } from "@/lib/portal";
import { StatusDot } from "../../status-dot";
import { ReplyForm } from "./reply-form";

export default async function PortalTicketPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ctx = await requirePortal();
  const t = await portalTicket(ctx, { key: decodeURIComponent(key).toUpperCase() });
  if (!t) notFound();
  const opts = portalOptions(ctx.org);

  const [status] = await db.select().from(ticketStatuses).where(eq(ticketStatuses.id, t.statusId));
  const [project] = t.projectId ? await db.select().from(projects).where(eq(projects.id, t.projectId)) : [];
  // Only client-visible comments, ever
  const thread = await db
    .select({ c: comments, name: users.name, email: users.email })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorUserId))
    .where(and(eq(comments.ticketId, t.id), eq(comments.visibility, "client"), isNull(comments.deletedAt)))
    .orderBy(asc(comments.createdAt));
  const authorIds = [...new Set(thread.map((r) => r.c.authorUserId).filter((id): id is string => Boolean(id)))];
  const clientAuthors = authorIds.length
    ? new Set(
        (await db.select({ userId: memberships.userId }).from(memberships).where(and(inArray(memberships.userId, authorIds), eq(memberships.role, "client")))).map((m) => m.userId),
      )
    : new Set<string>();
  const files = await listFiles({ ticketId: t.id, clientIds: ctx.clientIds }, ctx.user.id, ctx.org.timezone);
  const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: ctx.org.timezone });
  const closed = status?.category === "done" || status?.category === "cancelled";

  return (
    <div className="space-y-6">
      <Link href={project ? `/portal/projects/${project.id}` : "/portal/tickets"} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {project ? project.name : "Requests"}
      </Link>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="font-mono">{t.key}</span>
          {status && <StatusDot name={status.name} color={status.color} />}
          {opts.showDueDates && t.dueAt && <span>Due {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: ctx.org.timezone }).format(t.dueAt)}</span>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          {t.description && (
            <Card>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{t.description}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Conversation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {thread.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
              <ol className="space-y-4">
                {thread.map(({ c, name, email }) => {
                  const fromClient = c.authorUserId ? clientAuthors.has(c.authorUserId) : false;
                  return (
                    <li key={c.id} className={`rounded-lg border p-3 ${fromClient ? "" : "border-primary/60"}`}>
                      <p className="mb-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{c.authorUserId === ctx.user.id ? "You" : name || email || ctx.org.name}</span>
                        {!fromClient && ` · ${ctx.org.name}`} · {fmt.format(c.createdAt)}
                      </p>
                      <p className="whitespace-pre-wrap text-sm">{c.body}</p>
                    </li>
                  );
                })}
              </ol>
              <ReplyForm ticketId={t.id} readOnly={Boolean(ctx.preview)} closed={closed} />
            </CardContent>
          </Card>
        </div>
        <div>
          <FilesCard target={{ ticketId: t.id }} files={files} canManage={false} portal readOnly={Boolean(ctx.preview)} description="Screenshots, documents or anything else for this request." />
        </div>
      </div>
    </div>
  );
}
