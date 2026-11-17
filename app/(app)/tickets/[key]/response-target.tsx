import { Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { businessMinutesBetween, localDay } from "@/lib/business-hours";
import { cn } from "@/lib/utils";

const span = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
};

/**
 * The support reply-by time. Red once missed, yellow when it's due today.
 * "Left" counts business hours only, so evenings, closed days and holidays don't use it up.
 */
export async function ResponseTarget({
  orgId,
  timezone,
  dueAt,
  firstResponseAt,
  closed,
}: {
  orgId: string;
  timezone: string;
  dueAt: Date;
  firstResponseAt: Date | null;
  closed: boolean;
}) {
  const fmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone });
  const now = new Date();

  if (firstResponseAt || closed) {
    const late = firstResponseAt ? firstResponseAt > dueAt : false;
    return (
      <Card className="py-3">
        <CardContent className="flex items-start gap-2 text-sm">
          <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-muted-foreground">Reply by {fmt.format(dueAt)}</p>
            <p className={cn("text-xs", late ? "text-destructive" : "text-muted-foreground")}>
              {firstResponseAt ? `First reply ${fmt.format(firstResponseAt)}${late ? " (late)" : " (on time)"}` : "Closed without a reply"}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const missed = now > dueAt;
  const today = !missed && localDay(dueAt, timezone) === localDay(now, timezone);
  const left = missed ? 0 : await businessMinutesBetween(orgId, now, dueAt);
  const over = missed ? await businessMinutesBetween(orgId, dueAt, now) : 0;

  return (
    <Card className={cn("py-3", missed ? "border-destructive" : today ? "border-yellow-400" : undefined)} role={missed ? "alert" : undefined}>
      <CardContent className="flex items-start gap-2 text-sm">
        <Clock className={cn("mt-0.5 size-4 shrink-0", missed ? "text-destructive" : today ? "text-yellow-400" : "text-muted-foreground")} />
        <div>
          <p className={cn("font-medium", missed ? "text-destructive" : today ? "text-yellow-400" : undefined)}>
            {missed ? "Reply overdue" : today ? "Reply due today" : "Reply by"} · {fmt.format(dueAt)}
          </p>
          <p className="text-xs text-muted-foreground">
            {missed ? `Missed by ${span(over)} of business time. Reply or move it along to stop the clock.` : `${span(left)} of business time left.`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
