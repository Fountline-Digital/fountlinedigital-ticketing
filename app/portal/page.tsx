import Link from "next/link";
import { ArrowRight, CircleAlert, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { portalOptions, requirePortal } from "@/lib/portal";
import { portalProjects, portalTickets, waitingOnClient } from "@/lib/portal-queries";
import { timeAgo } from "@/lib/time-ago";
import { ProgressBar } from "./progress";
import { StatusDot } from "./status-dot";

export default async function PortalHome() {
  const ctx = await requirePortal();
  const opts = portalOptions(ctx.org);
  const [projects, waiting, recent] = await Promise.all([portalProjects(ctx), waitingOnClient(ctx), portalTickets(ctx, { open: true, limit: 5, requestsOnly: true })]);
  const first = (ctx.preview?.contactName ?? ctx.user.name ?? "").split(" ")[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Welcome{first ? `, ${first}` : ""}</h1>
          <p className="text-muted-foreground">{opts.welcomeMessage ?? `Follow your projects with ${ctx.org.name}, approve work and send us requests.`}</p>
        </div>
        {ctx.clientIds.length > 0 && (
          <Link href="/portal/requests/new" className={buttonVariants()}>
            <Plus /> New request
          </Link>
        )}
      </div>

      {ctx.clientIds.length === 0 && (
        <Card>
          <CardContent className="text-sm text-muted-foreground">Your account isn&apos;t linked to a company yet. Contact us and we&apos;ll set it up.</CardContent>
        </Card>
      )}

      {waiting.length > 0 && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleAlert className="size-4 text-primary" />
              Waiting on you
            </CardTitle>
            <CardDescription>These need your review before we can continue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {waiting.map((w) => (
              <Link
                key={`${w.kind}-${w.id}`}
                href={w.kind === "logos" ? `/portal/projects/${w.projectId}/logos` : w.kind === "website" ? `/portal/projects/${w.projectId}/website` : w.kind === "questionnaire" ? `/portal/projects/${w.projectId}/questionnaire` : `/portal/projects/${w.projectId}#${w.kind === "phase" ? "approvals" : "changes"}`}
                className="flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors hover:bg-muted"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{w.label}</span>
                  <span className="block text-xs text-muted-foreground">{w.projectName}</span>
                </span>
                <ArrowRight className="size-4 shrink-0" />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {projects.length > 0 && (
        <section className="space-y-3" aria-labelledby="projects-heading">
          <h2 id="projects-heading" className="text-lg font-semibold">
            Your projects
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map(({ project: p, current, percent, nextAction, phases }) => (
              <Link key={p.id} href={`/portal/projects/${p.id}`} className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
                <Card className="h-full transition-colors hover:bg-muted/40">
                  <CardHeader>
                    <CardTitle>{p.name}</CardTitle>
                    <CardDescription className="font-mono text-xs">{p.key}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ProgressBar percent={percent} label={`${p.name} progress`} />
                    <p className="text-sm">
                      {current ? (
                        <>
                          Step {current.position} of {phases.length}: <b>{current.name}</b>
                        </>
                      ) : p.status === "completed" ? (
                        "Complete"
                      ) : (
                        "Not started yet"
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">{nextAction}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3" aria-labelledby="recent-heading">
        <div className="flex items-center justify-between">
          <h2 id="recent-heading" className="text-lg font-semibold">
            Open requests
          </h2>
          <Link href="/portal/tickets" className="text-sm text-primary hover:underline">
            See all
          </Link>
        </div>
        <Card>
          <CardContent className="space-y-2">
            {recent.length === 0 && <p className="text-sm text-muted-foreground">Nothing open right now.</p>}
            {recent.map(({ t, statusName, statusColor, projectName }) => (
              <Link key={t.id} href={`/portal/tickets/${t.key}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 transition-colors hover:bg-muted">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t.key}
                    {projectName && ` · ${projectName}`} · updated {timeAgo(t.updatedAt)}
                  </span>
                </span>
                <StatusDot name={statusName} color={statusColor} />
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
