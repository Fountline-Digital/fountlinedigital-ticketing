import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { ArrowLeft, CheckCircle2, Circle, CircleDot, ChevronRight, ClipboardList, Clock, LayoutTemplate, Plus, Shapes } from "lucide-react";
import { db } from "@/db";
import { changeRequests, projectPhases } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilesCard } from "@/components/files/files-card";
import { listFiles } from "@/lib/file-access";
import { approvalsFor, requiredApprovers } from "@/lib/phases";
import { canApprove, clientUserIds, portalProject, requirePortal } from "@/lib/portal";
import { phaseLabel, portalTickets } from "@/lib/portal-queries";
import { questionnaireForProject } from "@/lib/questionnaire";
import { projectPicker } from "@/lib/website-picker";
import { projectBatches } from "@/lib/logo-picker";
import { timeAgo } from "@/lib/time-ago";
import { StatusDot } from "../../status-dot";
import { ChangeRequestDecision, PhaseDecision } from "./decisions";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default async function PortalProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePortal();
  const p = await portalProject(ctx, id);
  if (!p) notFound();
  const approver = canApprove(ctx, p.clientId);
  const readOnly = Boolean(ctx.preview);

  const phases = await db.select().from(projectPhases).where(eq(projectPhases.projectId, p.id)).orderBy(asc(projectPhases.position));
  const approvals = await approvalsFor(phases.map((ph) => ph.id));
  const clientPending = (ph: (typeof phases)[number]) =>
    ph.status === "awaiting_approval" &&
    requiredApprovers(ph.gateApprover).includes("client") &&
    !approvals.some((a) => a.projectPhaseId === ph.id && a.roundNumber === ph.revisionRoundsUsed + 1 && a.approverKind === "client" && a.decision !== "pending");

  const clientUsers = await clientUserIds(p.clientId);
  const crs = await db
    .select()
    .from(changeRequests)
    .where(and(eq(changeRequests.projectId, p.id)))
    .orderBy(desc(changeRequests.createdAt));
  // Drafts the team is pricing stay hidden, except ones the client asked for
  const visibleCrs = crs.filter((cr) => cr.status !== "cancelled" && (cr.status !== "draft" || (cr.requestedByUserId && clientUsers.includes(cr.requestedByUserId))));
  const work = await portalTickets(ctx, { projectId: p.id, order: "number", limit: 300 });
  const files = await listFiles({ projectId: p.id, clientIds: ctx.clientIds }, ctx.user.id, ctx.org.timezone);
  const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
  const toReview = phases.filter(clientPending);

  // Group the work: the client's own requests first, then each step in order.
  // The current step (and the requests group) start open; finished and future steps start closed.
  const isRequest = (t: (typeof work)[number]["t"]) => !t.projectPhaseId || t.source === "portal" || (t.reporterUserId !== null && clientUsers.includes(t.reporterUserId));
  const doneCount = (rows: typeof work) => rows.filter((r) => r.category === "done" || r.category === "cancelled").length;
  const currentPhase = phases.find((ph) => ph.status === "awaiting_approval") ?? phases.find((ph) => ph.status === "active");
  const requestRows = work.filter((r) => isRequest(r.t));
  const groups = [
    ...(requestRows.length ? [{ id: "requests", title: "Your requests", rows: requestRows, done: doneCount(requestRows), open: requestRows.some((r) => r.category !== "done" && r.category !== "cancelled") }] : []),
    ...phases
      .map((ph) => {
        const rows = work.filter((r) => r.t.projectPhaseId === ph.id && !isRequest(r.t));
        return { id: ph.id, title: `${ph.position}. ${ph.name}`, rows, done: doneCount(rows), open: ph.id === currentPhase?.id };
      })
      .filter((g) => g.rows.length > 0),
  ];
  const intake = await questionnaireForProject(p.id);
  const website = await projectPicker(p.id);
  const logoBatchesShown = (await projectBatches(p.id)).filter((b) => b.batch.status !== "draft");
  const logoChosen = logoBatchesShown.some((b) => b.batch.status === "chosen");
  const logoWaiting = logoBatchesShown[0]?.batch.status === "published";

  return (
    <div className="space-y-6">
      <Link href="/portal" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Home
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{p.name}</h1>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono">{p.key}</span>
          {p.targetLaunchDate && ` · Target launch ${dateFmt.format(new Date(`${p.targetLaunchDate}T00:00:00Z`))}`}
        </p>
      </div>

      {toReview.length > 0 && (
        <section id="approvals" className="scroll-mt-24 space-y-4" aria-label="Approvals">
          {toReview.map((ph) => (
            <Card key={ph.id} className="border-primary">
              <CardHeader>
                <CardTitle>Ready for your review: {ph.name}</CardTitle>
                <CardDescription>
                  {ctx.org.settings.portal?.approvalWording ?? "Approve it to move on, or tell us what to change."}
                  {ph.revisionRoundsAllowed > 0 && ` Revision rounds used: ${ph.revisionRoundsUsed} of ${ph.revisionRoundsAllowed}.`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {approver ? (
                  <PhaseDecision phaseId={ph.id} phaseName={ph.name} readOnly={readOnly} lastRound={ph.revisionRoundsUsed >= ph.revisionRoundsAllowed} />
                ) : (
                  <p className="text-sm text-muted-foreground">Your company&apos;s approver will review this. Ask us if that should be you.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Project steps</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {phases.map((ph) => {
                  const waiting = clientPending(ph);
                  const Icon = ph.status === "complete" ? CheckCircle2 : ph.status === "awaiting_approval" ? Clock : ph.status === "active" ? CircleDot : Circle;
                  return (
                    <li key={ph.id} className="flex items-start gap-3">
                      <Icon className={`mt-0.5 size-5 shrink-0 ${ph.status === "locked" ? "text-muted-foreground" : "text-primary"}`} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium ${ph.status === "locked" ? "text-muted-foreground" : ""}`}>
                          {ph.position}. {ph.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {phaseLabel(ph.status, waiting)}
                          {requiredApprovers(ph.gateApprover).includes("client") && ph.revisionRoundsAllowed > 0 && ` · revisions ${ph.revisionRoundsUsed}/${ph.revisionRoundsAllowed}`}
                        </p>
                      </div>
                      {waiting && <Badge>Your turn</Badge>}
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          {visibleCrs.length > 0 && (
            <Card id="changes" className="scroll-mt-24">
              <CardHeader>
                <CardTitle>Change requests</CardTitle>
                <CardDescription>Extra work outside your package. Nothing starts until you approve it.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {visibleCrs.map((cr) => (
                  <div key={cr.id} className="space-y-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{cr.key}</span>
                      <span className="flex-1 text-sm font-medium">{cr.title}</span>
                      <Badge variant={cr.status === "pending_client" ? "default" : "outline"}>
                        {{ draft: "We're reviewing it", pending_client: "Needs your approval", approved: "Approved", declined: "Declined" }[cr.status as string] ?? cr.status}
                      </Badge>
                    </div>
                    {cr.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{cr.description}</p>}
                    {cr.priceCents !== null && <p className="text-sm">Price: {cr.priceCents === 0 ? "No charge" : money(cr.priceCents)}</p>}
                    {cr.status === "pending_client" &&
                      (approver ? (
                        <ChangeRequestDecision crId={cr.id} title={cr.title} readOnly={readOnly} />
                      ) : (
                        <p className="text-sm text-muted-foreground">Waiting on your company&apos;s approver.</p>
                      ))}
                    {cr.decisionComment && cr.status !== "pending_client" && <p className="text-xs text-muted-foreground">Note: {cr.decisionComment}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Work on this project</CardTitle>
              <CardDescription>Grouped by step, in the order we&apos;ll do it. Your own requests are first.</CardDescription>
              <CardAction>
                <Link href={`/portal/requests/new?project=${p.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                  <Plus /> New request
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-3">
              {work.length === 0 && <p className="text-sm text-muted-foreground">Nothing shared yet.</p>}
              {groups.map((g) => (
                <details key={g.id} open={g.open} className="group rounded-lg border">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
                    <span className="flex-1">{g.title}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {g.done} of {g.rows.length} done
                    </span>
                  </summary>
                  <div className="space-y-1.5 border-t p-2">
                    {g.rows.map(({ t, statusName, statusColor, category }) => (
                      <Link key={t.id} href={`/portal/tickets/${t.key}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 transition-colors hover:bg-muted">
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-sm ${category === "done" || category === "cancelled" ? "text-muted-foreground" : ""}`}>{t.title}</span>
                          <span className="block text-xs text-muted-foreground">
                            {t.key} · updated {timeAgo(t.updatedAt)}
                          </span>
                        </span>
                        {category === "waiting" && <Badge>Waiting on you</Badge>}
                        <StatusDot name={statusName} color={statusColor} />
                      </Link>
                    ))}
                  </div>
                </details>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {website.offers.length > 0 && (
            <Card className={website.selection?.lockedAt ? undefined : "border-primary"}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LayoutTemplate className="size-4" />
                  Website design
                </CardTitle>
                <CardDescription>
                  {website.selection?.lockedAt
                    ? `You chose ${website.offers.find((o) => o.d.id === website.selection?.designId)?.d.name ?? "a design"}.`
                    : `${website.offers.length} designs are ready for you to choose from.`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href={`/portal/projects/${p.id}/website`} className={buttonVariants({ variant: website.selection?.lockedAt ? "outline" : "default", size: "sm" })}>
                  {website.selection?.lockedAt ? "View your choice" : "Choose a design"}
                </Link>
              </CardContent>
            </Card>
          )}
          {logoBatchesShown.length > 0 && (
            <Card className={logoWaiting ? "border-primary" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shapes className="size-4" />
                  Logo
                </CardTitle>
                <CardDescription>
                  {logoChosen ? "You've chosen your logo." : logoWaiting ? "New concepts are ready for you." : "We're working on your next batch."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href={`/portal/projects/${p.id}/logos`} className={buttonVariants({ variant: logoWaiting ? "default" : "outline", size: "sm" })}>
                  {logoWaiting ? "Review concepts" : "View"}
                </Link>
              </CardContent>
            </Card>
          )}
          {intake && (
            <Card className={intake.response?.submittedAt ? undefined : "border-primary"}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="size-4" />
                  {intake.questionnaire.name}
                </CardTitle>
                <CardDescription>
                  {intake.response?.submittedAt ? "Submitted. You can update your answers any time." : intake.response ? "Started. Finish and submit when you're ready." : "Not started yet. It helps us plan your project."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  href={`/portal/projects/${p.id}/questionnaire`}
                  className={buttonVariants({ variant: intake.response?.submittedAt ? "outline" : "default", size: "sm" })}
                >
                  {intake.response?.submittedAt ? "View or update" : intake.response ? "Continue" : "Start"}
                </Link>
              </CardContent>
            </Card>
          )}
          <FilesCard target={{ projectId: p.id }} files={files} canManage={false} portal readOnly={readOnly} description="Files shared with you and files you've sent us." />
        </div>
      </div>
    </div>
  );
}
