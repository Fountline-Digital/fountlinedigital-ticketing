"use client";
import { useState, useTransition } from "react";
import { Archive, ArrowDown, ArrowUp, MoreHorizontal, Pencil, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addStarterRoles,
  createTeamRole,
  deleteTeamRole,
  reorderTeamRoles,
  setTeamRoleActive,
  updateTeamRole,
  type Result,
} from "./actions";

type Role = {
  id: string;
  name: string;
  description: string;
  color: string;
  widgets: string[];
  isActive: boolean;
  usage: { people: number; tasks: number; tickets: number };
};
type Widget = { value: string; label: string; hint: string };

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

function RoleDialog({
  open,
  onOpenChange,
  role,
  widgets,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  role?: Role;
  widgets: Widget[];
}) {
  const { pending, run } = useRun();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [color, setColor] = useState(role?.color ?? "#c0c0c0");
  const [chosen, setChosen] = useState<string[]>(role?.widgets ?? ["waiting_on_client"]);
  const toggle = (w: string, on: boolean) => setChosen((c) => (on ? [...c, w] : c.filter((x) => x !== w)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{role ? `Edit ${role.name}` : "New team role"}</DialogTitle>
          <DialogDescription>People can have several team roles, and lead any of them.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="grid gap-2">
              <Label htmlFor="tr-name">Name</Label>
              <Input id="tr-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Photography" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tr-color">Color</Label>
              <input
                id="tr-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-12 cursor-pointer rounded-lg border bg-black p-1"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tr-desc">Description</Label>
            <Textarea id="tr-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What this team handles" />
          </div>
          <div className="grid gap-2">
            <Label>Dashboard widgets</Label>
            <div className="space-y-2 rounded-lg border p-3">
              {widgets.map((w) => (
                <label key={w.value} className="flex items-start gap-2 text-sm">
                  <Checkbox checked={chosen.includes(w.value)} onCheckedChange={(c) => toggle(w.value, Boolean(c))} className="mt-0.5" />
                  <span>
                    {w.label}
                    <span className="block text-xs text-muted-foreground">{w.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Every team tab also shows its open tickets, overdue work and workload.</p>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={pending || !name.trim()}
            onClick={() =>
              run(
                () =>
                  role
                    ? updateTeamRole(role.id, { name, description, color, widgets: chosen })
                    : createTeamRole({ name, description, color, widgets: chosen }),
                (r) => !r.error && onOpenChange(false),
              )
            }
          >
            {role ? "Save" : "Add role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeamRolesManager({ roles, widgets }: { roles: Role[]; widgets: Widget[] }) {
  const { pending, run } = useRun();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);
  const widgetLabel = new Map(widgets.map((w) => [w.value, w.label] as const));

  const move = (index: number, dir: -1 | 1) => {
    const ids = roles.map((r) => r.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    run(() => reorderTeamRoles(ids));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setCreating(true)}>
          <Plus />
          New team role
        </Button>
        {roles.length === 0 && (
          <Button variant="outline" disabled={pending} onClick={() => run(() => addStarterRoles())}>
            <Sparkles />
            Add the 5 starter roles
          </Button>
        )}
      </div>

      {roles.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No team roles yet. Start with Sales, Design, Development, Support and Content, then change them however you like.
          </CardContent>
        </Card>
      )}

      {roles.map((r, i) => (
        <Card key={r.id} className={r.isActive ? undefined : "opacity-60"}>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex gap-1 sm:flex-col">
              <Button variant="ghost" size="icon-xs" aria-label="Move up" disabled={pending || i === 0} onClick={() => move(i, -1)}>
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label="Move down" disabled={pending || i === roles.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown />
              </Button>
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="size-3 rounded-full" style={{ backgroundColor: r.color }} />
                <span className="font-semibold">{r.name}</span>
                {!r.isActive && <Badge variant="outline">Retired</Badge>}
              </div>
              {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
              <div className="flex flex-wrap gap-1">
                {r.widgets.map((w) => (
                  <Badge key={w} variant="secondary">
                    {widgetLabel.get(w) ?? w}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {r.usage.people} people · {r.usage.tasks} template tasks · {r.usage.tickets} tickets
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label={`${r.name} actions`}>
                    <MoreHorizontal />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditing(r)}>
                  <Pencil />
                  Edit
                </DropdownMenuItem>
                {r.isActive ? (
                  <DropdownMenuItem onClick={() => run(() => setTeamRoleActive(r.id, false))}>
                    <Archive />
                    Retire
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => run(() => setTeamRoleActive(r.id, true))}>
                    <RotateCcw />
                    Bring back
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setDeleting(r)}>
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardContent>
        </Card>
      ))}

      {creating && <RoleDialog open onOpenChange={setCreating} widgets={widgets} />}
      {editing && <RoleDialog open onOpenChange={(o) => !o && setEditing(null)} role={editing} widgets={widgets} />}

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Only possible when no people, template tasks or tickets use it. Otherwise retire it, so past work keeps its history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={pending} onClick={() => deleting && run(() => deleteTeamRole(deleting.id), () => setDeleting(null))}>
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
