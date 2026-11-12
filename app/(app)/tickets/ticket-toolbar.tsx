"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bookmark, Columns3, List, Loader2, Search, Trash2, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { TicketFilters } from "./query";
import { deleteView, saveView } from "./views-actions";

type Option = { value: string; label: string };
type SavedView = { id: string; name: string; view: "list" | "board"; filters: Record<string, string>; shared: boolean; mine: boolean };

const ANY = "__any";

function FilterSelect({
  label,
  value,
  items,
  onChange,
  width = "w-40",
}: {
  label: string;
  value: string;
  items: (Option | "sep")[];
  onChange: (v: string) => void;
  width?: string;
}) {
  const flat = items.filter((i): i is Option => i !== "sep");
  return (
    <Select items={flat} value={value} onValueChange={(v) => onChange(String(v ?? ANY))}>
      <SelectTrigger size="sm" className={width} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i, idx) =>
          i === "sep" ? (
            <SelectSeparator key={`sep-${idx}`} />
          ) : (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ),
        )}
      </SelectContent>
    </Select>
  );
}

export function TicketToolbar({
  view,
  filters,
  options,
  savedViews,
  canShare,
}: {
  view: "list" | "board";
  filters: TicketFilters;
  options: { statuses: Option[]; priorities: Option[]; types: Option[]; team: Option[]; projects: Option[]; teamRoles: Option[] };
  savedViews: SavedView[];
  canShare: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [navigating, startNav] = useTransition();
  const [q, setQ] = useState(filters.q ?? "");
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [shared, setShared] = useState(false);
  const [saving, startSave] = useTransition();
  const first = useRef(true);

  const go = (next: URLSearchParams) => startNav(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === ANY || value === "") next.delete(key);
    else next.set(key, value);
    go(next);
  };

  // Search as you type (after a short pause)
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => setParam("q", q.trim() || null), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const current = Object.fromEntries([...params.entries()].filter(([k]) => k !== "view"));
  const hasFilters = Object.keys(current).some((k) => k !== "status" || current[k] !== "open");
  const mine = filters.assignee === "me";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tickets, projects, clients" className="h-8 pl-8" aria-label="Search" />
        </div>
        <Button size="sm" variant={mine ? "default" : "outline"} onClick={() => setParam("assignee", mine ? null : "me")}>
          <UserRound />
          My tickets
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {navigating && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
              <Bookmark />
              Saved views
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-60">
              {savedViews.length > 0 && (
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Views</DropdownMenuLabel>
                  {savedViews.map((v) => (
                    <DropdownMenuItem
                      key={v.id}
                      onClick={() => go(new URLSearchParams({ ...v.filters, ...(v.view === "board" ? { view: "board" } : {}) }))}
                    >
                      <span className="flex-1 truncate">{v.name}</span>
                      {v.shared && <span className="text-xs text-muted-foreground">Team</span>}
                      {(v.mine || canShare) && (
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={`Delete ${v.name}`}
                          className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            startSave(async () => {
                              const r = await deleteView(v.id);
                              if (r.error) toast.error(r.error);
                              else toast.success(r.ok);
                            });
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </span>
                      )}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </DropdownMenuGroup>
              )}
              <DropdownMenuItem onClick={() => setSaveOpen(true)}>Save current view…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex overflow-hidden rounded-lg border" role="group" aria-label="View">
            <button
              type="button"
              onClick={() => setParam("view", null)}
              className={cn("flex items-center gap-1 px-2.5 py-1 text-xs", view === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
            >
              <List className="size-3.5" />
              List
            </button>
            <button
              type="button"
              onClick={() => setParam("view", "board")}
              className={cn("flex items-center gap-1 px-2.5 py-1 text-xs", view === "board" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
            >
              <Columns3 className="size-3.5" />
              Board
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {view === "list" ? (
          <FilterSelect
            label="Status"
            value={filters.status ?? "open"}
            onChange={(v) => setParam("status", v === "open" ? null : v)}
            items={[
              { value: "open", label: "Open" },
              { value: "done", label: "Done & cancelled" },
              { value: "all", label: "All statuses" },
              "sep",
              ...options.statuses,
            ]}
          />
        ) : null}
        <FilterSelect
          label="Priority"
          value={filters.priority ?? ANY}
          onChange={(v) => setParam("priority", v)}
          items={[{ value: ANY, label: "Any priority" }, "sep", ...options.priorities]}
          width="w-36"
        />
        <FilterSelect
          label="Assignee"
          value={filters.assignee ?? ANY}
          onChange={(v) => setParam("assignee", v)}
          items={[{ value: ANY, label: "Anyone" }, { value: "me", label: "Me" }, { value: "none", label: "Unassigned" }, "sep", ...options.team]}
        />
        <FilterSelect
          label="Due"
          value={filters.due ?? ANY}
          onChange={(v) => setParam("due", v)}
          items={[{ value: ANY, label: "Any due date" }, { value: "overdue", label: "Overdue" }, { value: "week", label: "Due in 7 days" }]}
          width="w-36"
        />
        {options.teamRoles.length > 0 && (
          <FilterSelect
            label="Team role"
            value={filters.teamRole ?? ANY}
            onChange={(v) => setParam("teamRole", v)}
            items={[{ value: ANY, label: "Any team" }, { value: "none", label: "No team role" }, "sep", ...options.teamRoles]}
            width="w-36"
          />
        )}
        <FilterSelect
          label="Type"
          value={filters.type ?? ANY}
          onChange={(v) => setParam("type", v)}
          items={[{ value: ANY, label: "Any type" }, "sep", ...options.types]}
        />
        {options.projects.length > 0 && (
          <FilterSelect
            label="Project"
            value={filters.project ?? ANY}
            onChange={(v) => setParam("project", v)}
            items={[{ value: ANY, label: "Any project" }, "sep", ...options.projects]}
            width="w-56"
          />
        )}
        {view === "list" && (
          <FilterSelect
            label="Sort"
            value={filters.sort ?? "updated"}
            onChange={(v) => setParam("sort", v === "updated" ? null : v)}
            items={[
              { value: "updated", label: "Recently updated" },
              { value: "due", label: "Due date" },
              { value: "priority", label: "Priority" },
              { value: "key", label: "Newest" },
            ]}
          />
        )}
        {hasFilters && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setQ("");
              go(new URLSearchParams(view === "board" ? { view: "board" } : {}));
            }}
          >
            <X />
            Clear
          </Button>
        )}
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save this view</DialogTitle>
            <DialogDescription>Saves the current filters and {view === "board" ? "board" : "list"} layout.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="view-name">Name</Label>
            <Input id="view-name" value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="e.g. Waiting on client" autoFocus />
          </div>
          {canShare && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={shared} onCheckedChange={(c) => setShared(Boolean(c))} />
              Share with the whole team
            </label>
          )}
          <DialogFooter>
            <Button
              disabled={saving || !viewName.trim()}
              onClick={() =>
                startSave(async () => {
                  const r = await saveView(viewName, shared, view, current);
                  if (r.error) toast.error(r.error);
                  else {
                    toast.success(r.ok);
                    setSaveOpen(false);
                    setViewName("");
                    setShared(false);
                  }
                })
              }
            >
              Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
