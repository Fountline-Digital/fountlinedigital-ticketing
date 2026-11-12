import Link from "next/link";
import { Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TicketStatus } from "../projects/status-badge";
import type { TicketRow } from "./query";

const dueFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function DueDate({ dueAt, done }: { dueAt: Date | null; done: boolean }) {
  if (!dueAt) return <span className="text-muted-foreground">—</span>;
  const overdue = !done && dueAt.getTime() < Date.now();
  return <span className={overdue ? "font-medium text-destructive" : undefined}>{overdue ? `Overdue · ${dueFmt.format(dueAt)}` : dueFmt.format(dueAt)}</span>;
}

export function PriorityLabel({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="h-3 w-1 rounded-sm" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}

export function TicketTable({ tickets, limitReached }: { tickets: TicketRow[]; limitReached: boolean }) {
  return (
    <Card>
      <CardContent>
        {tickets.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No tickets match these filters.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Key</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Priority</TableHead>
                <TableHead className="hidden lg:table-cell">Assignee</TableHead>
                <TableHead className="hidden md:table-cell">Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((t) => {
                const done = t.statusCategory === "done" || t.statusCategory === "cancelled";
                return (
                  <TableRow key={t.id} className="relative">
                    <TableCell className="font-mono text-xs text-muted-foreground">{t.key}</TableCell>
                    <TableCell className="max-w-0 w-full">
                      <Link href={`/tickets/${t.key}`} className="flex items-center gap-1.5 font-medium after:absolute after:inset-0">
                        <span className="truncate">{t.title}</span>
                        {t.isClientVisible && <Eye className="size-3.5 shrink-0 text-muted-foreground" aria-label="Client can see" />}
                      </Link>
                      <div className="truncate text-xs text-muted-foreground">
                        {t.typeName}
                        {t.teamRoleName ? ` · ${t.teamRoleName}` : ""}
                        {t.projectKey ? ` · ${t.projectKey}` : ""}
                        {t.clientName ? ` · ${t.clientName}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <TicketStatus name={t.statusName} color={t.statusColor} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <PriorityLabel name={t.priorityName} color={t.priorityColor} />
                    </TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">{t.assigneeName || t.assigneeEmail || <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      <DueDate dueAt={t.dueAt} done={done} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {limitReached && <p className="pt-3 text-center text-xs text-muted-foreground">Showing the first 200. Narrow the filters to see the rest.</p>}
      </CardContent>
    </Card>
  );
}
