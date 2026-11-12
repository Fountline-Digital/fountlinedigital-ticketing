"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createInvite, type InviteState } from "./actions";
import { TeamRolesPicker, type TeamRoleChoice, type TeamRoleSelection } from "./team-roles-picker";

type Option = { value: string; label: string };

export function InviteDialog(props: {
  roles: Option[];
  clients: Option[];
  staffDomains: string[];
  contractorDays: number;
  teamRoles: TeamRoleChoice[];
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFormKey((k) => k + 1); // fresh form next time
      }}
    >
      <DialogTrigger render={<Button />}>
        <UserPlus />
        Invite someone
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite someone</DialogTitle>
          <DialogDescription>They&apos;ll get an email with how to sign in and set up two-factor.</DialogDescription>
        </DialogHeader>
        <InviteForm key={formKey} {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({
  roles,
  clients,
  staffDomains,
  contractorDays,
  teamRoles,
  onDone,
}: {
  roles: Option[];
  clients: Option[];
  staffDomains: string[];
  contractorDays: number;
  teamRoles: TeamRoleChoice[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<InviteState, FormData>(createInvite, {});
  const [role, setRole] = useState(roles.find((r) => r.value === "worker")?.value ?? roles[0]?.value ?? "");
  const isTeam = role === "admin" || role === "manager" || role === "worker";
  const [teamSel, setTeamSel] = useState<TeamRoleSelection[]>([]);

  const handled = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!state.at || handled.current === state.at) return;
    handled.current = state.at;
    if (state.ok) {
      toast.success(state.ok);
      onDone();
    } else if (state.error) {
      toast.error(state.error);
      onDone();
    }
  }, [state.at, state.ok, state.error, onDone]);

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" name="email" type="email" required autoFocus />
        {isTeam && staffDomains.length > 0 && (
          <p className="text-xs text-muted-foreground">Team roles need an @{staffDomains.join(" or @")} address.</p>
        )}
      </div>

      <div className="grid gap-2">
        <Label>Role</Label>
        <Select items={roles} name="role" value={role} onValueChange={(v) => setRole(String(v ?? ""))}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {role === "contractor" && (
        <div className="grid gap-2">
          <Label htmlFor="invite-ends">Access ends</Label>
          <Input id="invite-ends" name="accessEnds" type="date" />
          <p className="text-xs text-muted-foreground">Leave empty for {contractorDays} days from today.</p>
        </div>
      )}

      {role === "client" && (
        <>
          <div className="grid gap-2">
            <Label>Client</Label>
            <Select items={clients} name="clientId" required>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-name">Contact name</Label>
            <Input id="invite-name" name="contactName" />
          </div>
          <div className="grid gap-3">
            <Label>Contact roles</Label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="isPrimary" /> Primary contact
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="isApprover" defaultChecked /> Approver (can approve phases and change requests)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="isBilling" /> Billing
            </label>
          </div>
        </>
      )}

      {role !== "client" && teamRoles.length > 0 && (
        <div className="grid gap-2">
          <Label>Team roles</Label>
          <input type="hidden" name="teamRoles" value={JSON.stringify(teamSel)} />
          <TeamRolesPicker roles={teamRoles} value={teamSel} onChange={setTeamSel} allowLead={role !== "contractor"} />
        </div>
      )}

      {state.error && !state.at && <p className="text-sm text-destructive">{state.error}</p>}

      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Send invite
        </Button>
      </DialogFooter>
    </form>
  );
}
