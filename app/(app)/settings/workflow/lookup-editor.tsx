"use client";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, Plus, RotateCcw, Star, Trash2, Archive } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LISTS, type ListKey, type LookupField } from "@/lib/lookups";
import { deleteLookup, moveLookup, saveLookup, setLookupActive, setLookupDefault, type Result } from "./actions";

type Item = Record<string, unknown> & { id: string; name: string; isActive: boolean; used: number };

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, after?: (r: Result) => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else if (r.ok) toast.success(r.ok);
      after?.(r);
    });
  return { pending, run };
}

function ItemDialog({ list, item, onClose }: { list: ListKey; item: Item | null; onClose: () => void }) {
  const fields = LISTS[list].fields as readonly LookupField[];
  const { pending, run } = useRun();
  const [v, setV] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, item?.[f.key] ?? (f.kind === "color" ? "#c0c0c0" : f.kind === "bool" ? false : f.kind === "select" ? f.options?.[0]?.value : "")])),
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? `Edit ${item.name}` : `Add to ${LISTS[list].label.toLowerCase()}`}</DialogTitle>
        </DialogHeader>
        <form
          id="lookup-form"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveLookup(list, item?.id ?? null, v), (r) => r.ok && onClose());
          }}
        >
          {fields.map((f) => {
            const id = `lk-${f.key}`;
            const locked = Boolean(f.createOnly && item);
            return (
              <div key={f.key} className="grid gap-1.5">
                {f.kind === "bool" ? (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={Boolean(v[f.key])} onCheckedChange={(c) => setV((s) => ({ ...s, [f.key]: Boolean(c) }))} /> {f.label}
                  </label>
                ) : (
                  <Label htmlFor={id}>{f.label}</Label>
                )}
                {f.kind === "text" && <Input id={id} value={String(v[f.key] ?? "")} maxLength={60} onChange={(e) => setV((s) => ({ ...s, [f.key]: e.target.value }))} required />}
                {f.kind === "code" && (
                  <Input id={id} value={String(v[f.key] ?? "")} maxLength={8} disabled={locked} className="w-32 font-mono uppercase" onChange={(e) => setV((s) => ({ ...s, [f.key]: e.target.value.toUpperCase() }))} required />
                )}
                {f.kind === "color" && (
                  <div className="flex items-center gap-2">
                    <input id={id} type="color" value={String(v[f.key])} onChange={(e) => setV((s) => ({ ...s, [f.key]: e.target.value }))} className="h-9 w-12 cursor-pointer rounded border bg-transparent" />
                    <span className="font-mono text-xs text-muted-foreground">{String(v[f.key])}</span>
                  </div>
                )}
                {f.kind === "select" && (
                  <select id={id} value={String(v[f.key])} onChange={(e) => setV((s) => ({ ...s, [f.key]: e.target.value }))} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
                {f.hint && <p className="text-xs text-muted-foreground">{locked ? "Set when it was created; existing keys depend on it." : f.hint}</p>}
              </div>
            );
          })}
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="lookup-form" disabled={pending}>
            {item ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LookupEditor({ list, items }: { list: ListKey; items: Item[] }) {
  const cfg = LISTS[list];
  const fields = cfg.fields as readonly LookupField[];
  const { pending, run } = useRun();
  const [editing, setEditing] = useState<Item | null | "new">(null);
  const label = (f: LookupField, value: unknown) => f.options?.find((o) => o.value === value)?.label.split(" (")[0] ?? String(value);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{cfg.label}</CardTitle>
        <CardDescription>{cfg.hint}</CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> Add
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {items.map((it, i) => (
          <div key={it.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 ${it.isActive ? "" : "opacity-60"}`}>
            <div className="flex">
              <Button size="icon-xs" variant="ghost" aria-label={`Move ${it.name} up`} disabled={pending || i === 0} onClick={() => run(() => moveLookup(list, it.id, -1))}>
                <ArrowUp />
              </Button>
              <Button size="icon-xs" variant="ghost" aria-label={`Move ${it.name} down`} disabled={pending || i === items.length - 1} onClick={() => run(() => moveLookup(list, it.id, 1))}>
                <ArrowDown />
              </Button>
            </div>
            {typeof it.color === "string" && <span className="size-3 rounded-full border" style={{ backgroundColor: it.color }} aria-hidden />}
            <span className="min-w-0 flex-1 text-sm font-medium">
              {it.name}
              {typeof it.code === "string" && <span className="ml-2 font-mono text-xs text-muted-foreground">{it.code}</span>}
            </span>
            {fields
              .filter((f) => f.kind === "select")
              .map((f) => (
                <Badge key={f.key} variant="outline">
                  {label(f, it[f.key])}
                </Badge>
              ))}
            {Boolean(it.pausesResponseClock) && <Badge variant="outline">Pauses clock</Badge>}
            {Boolean(it.isDefault) && <Badge>Default</Badge>}
            {!it.isActive && <Badge variant="secondary">Retired</Badge>}
            {it.used > 0 && <span className="text-xs text-muted-foreground">{it.used} tickets</span>}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`More for ${it.name}`} />}>
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditing(it)}>
                  <Pencil /> Edit
                </DropdownMenuItem>
                {cfg.hasDefault && it.isActive && !it.isDefault && (
                  <DropdownMenuItem onClick={() => run(() => setLookupDefault(list as "statuses" | "priorities", it.id))}>
                    <Star /> Make default
                  </DropdownMenuItem>
                )}
                {it.isActive ? (
                  <DropdownMenuItem onClick={() => run(() => setLookupActive(list, it.id, false))}>
                    <Archive /> Retire
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => run(() => setLookupActive(list, it.id, true))}>
                    <RotateCcw /> Restore
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => confirm(`Delete ${it.name}? Only possible if nothing uses it.`) && run(() => deleteLookup(list, it.id))}>
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </CardContent>
      {editing && <ItemDialog list={list} item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}
