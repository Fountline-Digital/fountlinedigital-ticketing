"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { deleteForever, restoreItem, type Result } from "./actions";

type Item = {
  kind: string;
  kindLabel: string;
  id: string;
  label: string;
  detail: string;
  href: string | null;
  deleted: string;
  deletedBy: string | null;
  daysLeft: number;
  blockedReason: string | null;
};

export function TrashList({ items, kinds, canPurge }: { items: Item[]; kinds: { value: string; label: string }[]; canPurge: boolean }) {
  const [filter, setFilter] = useState("");
  const [purging, setPurging] = useState<Item | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else if (r.ok) toast.success(r.ok);
      after?.();
    });
  const shown = filter ? items.filter((i) => i.kind === filter) : items;
  const countOf = (k: string) => items.filter((i) => i.kind === k).length;

  return (
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
        {[{ value: "", label: "Everything" }, ...kinds].map((k) => (
          <button
            key={k.value}
            type="button"
            aria-pressed={filter === k.value}
            onClick={() => setFilter(k.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              filter === k.value ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {k.label} ({k.value ? countOf(k.value) : items.length})
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-2">
          {shown.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Trash is empty.</p>}
          {shown.map((i) => (
            <div key={`${i.kind}-${i.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2">
              <Badge variant="outline">{i.kindLabel}</Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.label}</p>
                <p className="text-xs text-muted-foreground">
                  {i.detail && (
                    <>
                      {i.href ? (
                        <Link href={i.href} className="hover:underline">
                          {i.detail}
                        </Link>
                      ) : (
                        i.detail
                      )}
                      {" · "}
                    </>
                  )}
                  Deleted {i.deleted}
                  {i.deletedBy && ` by ${i.deletedBy}`} ·{" "}
                  <span className={i.daysLeft <= 3 ? "text-destructive" : undefined}>
                    {i.daysLeft === 0 ? "deleted for good tonight" : `${i.daysLeft} day${i.daysLeft === 1 ? "" : "s"} left`}
                  </span>
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={pending || Boolean(i.blockedReason)}
                title={i.blockedReason ?? undefined}
                onClick={() => run(() => restoreItem(i.kind, i.id))}
              >
                <RotateCcw /> Restore
              </Button>
              {canPurge && (
                <Button size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Delete ${i.label} for good`} disabled={pending} onClick={() => setPurging(i)}>
                  <Trash2 />
                </Button>
              )}
              {i.blockedReason && <p className="w-full text-xs text-muted-foreground">{i.blockedReason}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(purging)} onOpenChange={(o: boolean) => !o && setPurging(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete for good?</AlertDialogTitle>
            <AlertDialogDescription>
              {purging?.kind === "ticket"
                ? "The ticket, its comments, checklist and files are removed permanently. Its history stays in the audit log."
                : purging?.kind === "file"
                  ? "The stored file is removed permanently."
                  : "This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={pending} onClick={() => purging && run(() => deleteForever(purging.kind, purging.id), () => setPurging(null))}>
              Delete for good
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
