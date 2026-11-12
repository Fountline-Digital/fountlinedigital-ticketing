"use client";
import { Checkbox } from "@/components/ui/checkbox";

export type TeamRoleChoice = { value: string; label: string; color: string };
export type TeamRoleSelection = { teamRoleId: string; isLead: boolean };

/** Pick any number of team roles, and mark which ones this person leads. */
export function TeamRolesPicker({
  roles,
  value,
  onChange,
  allowLead,
}: {
  roles: TeamRoleChoice[];
  value: TeamRoleSelection[];
  onChange: (v: TeamRoleSelection[]) => void;
  allowLead: boolean;
}) {
  if (roles.length === 0) {
    return <p className="text-sm text-muted-foreground">No team roles yet. Add them in Team roles.</p>;
  }
  const get = (id: string) => value.find((v) => v.teamRoleId === id);
  const set = (id: string, has: boolean, isLead = false) =>
    onChange(has ? [...value.filter((v) => v.teamRoleId !== id), { teamRoleId: id, isLead }] : value.filter((v) => v.teamRoleId !== id));

  return (
    <div className="divide-y rounded-lg border">
      {roles.map((r) => {
        const sel = get(r.value);
        return (
          <div key={r.value} className="flex items-center gap-3 px-3 py-2 text-sm">
            <label className="flex flex-1 items-center gap-2">
              <Checkbox checked={Boolean(sel)} onCheckedChange={(c) => set(r.value, Boolean(c), sel?.isLead ?? false)} />
              <span className="size-2 rounded-full" style={{ backgroundColor: r.color }} />
              {r.label}
            </label>
            {allowLead && (
              <label className={`flex items-center gap-2 text-xs ${sel ? "" : "opacity-40"}`}>
                <Checkbox checked={Boolean(sel?.isLead)} disabled={!sel} onCheckedChange={(c) => set(r.value, true, Boolean(c))} />
                Lead
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}
