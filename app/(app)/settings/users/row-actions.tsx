"use client";
import { useState, useTransition } from "react";
import { CalendarClock, LogOut, Mail, MoreHorizontal, ShieldOff, UserCheck, UserCog, UserX, X } from "lucide-react";
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
import { Button } from "@/components/ui/button";
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
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  changeRole,
  resendInvite,
  resetTwoFactor,
  revokeInvite,
  setAccessEnds,
  setActive,
  signOutEverywhere,
  type ActionResult,
} from "./actions";

type ServerAction = (fd: FormData) => Promise<ActionResult>;

function useRunAction() {
  const [pending, start] = useTransition();
  const run = (action: ServerAction, fields: Record<string, string>, after?: () => void) =>
    start(async () => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      const result = await action(fd);
      if (result.error) toast.error(result.error);
      else if (result.ok) toast.success(result.ok);
      after?.();
    });
  return { pending, run };
}

type Confirm = { title: string; description: string; label: string; destructive?: boolean; onConfirm: () => void };

function ConfirmDialog({ confirm, onClose, pending }: { confirm: Confirm | null; onClose: () => void; pending: boolean }) {
  return (
    <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant={confirm?.destructive ? "destructive" : "default"} disabled={pending} onClick={confirm?.onConfirm}>
            {confirm?.label}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const menuTrigger = (
  <Button variant="ghost" size="icon-sm" aria-label="Actions">
    <MoreHorizontal />
  </Button>
);

export function InviteActions({ inviteId, email }: { inviteId: string; email: string }) {
  const { pending, run } = useRunAction();
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={menuTrigger} />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => run(resendInvite, { inviteId })}>
            <Mail />
            Resend invite
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() =>
              setConfirm({
                title: "Revoke invite?",
                description: `${email} won't be able to use this invite.`,
                label: "Revoke",
                destructive: true,
                onConfirm: () => run(revokeInvite, { inviteId }, () => setConfirm(null)),
              })
            }
          >
            <X />
            Revoke
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} pending={pending} />
    </>
  );
}

export function MemberActions({
  membershipId,
  name,
  role,
  isActive,
  isContractor,
  accessEnds,
  roles,
}: {
  membershipId: string;
  name: string;
  role: string;
  isActive: boolean;
  isContractor: boolean;
  accessEnds: string;
  roles: { value: string; label: string }[];
}) {
  const { pending, run } = useRunAction();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [endsOpen, setEndsOpen] = useState(false);
  const [newRole, setNewRole] = useState(role);
  const [newEnds, setNewEnds] = useState(accessEnds);
  const id = { membershipId };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={menuTrigger} />
        <DropdownMenuContent align="end" className="min-w-52">
          {roles.length > 0 && (
            <DropdownMenuItem onClick={() => setRoleOpen(true)}>
              <UserCog />
              Change role
            </DropdownMenuItem>
          )}
          {isContractor && (
            <DropdownMenuItem onClick={() => setEndsOpen(true)}>
              <CalendarClock />
              Change access end date
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() =>
              setConfirm({
                title: "Sign out everywhere?",
                description: `${name} will be signed out on every device.`,
                label: "Sign out",
                onConfirm: () => run(signOutEverywhere, id, () => setConfirm(null)),
              })
            }
          >
            <LogOut />
            Sign out everywhere
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              setConfirm({
                title: "Reset two-factor?",
                description: `${name} will be signed out and must set up two-factor again on their next sign-in.`,
                label: "Reset two-factor",
                onConfirm: () => run(resetTwoFactor, id, () => setConfirm(null)),
              })
            }
          >
            <ShieldOff />
            Reset two-factor
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {isActive ? (
            <DropdownMenuItem
              variant="destructive"
              onClick={() =>
                setConfirm({
                  title: "Deactivate this person?",
                  description: `${name} will be signed out right away and can't sign in until reactivated.`,
                  label: "Deactivate",
                  destructive: true,
                  onConfirm: () => run(setActive, { ...id, activate: "false" }, () => setConfirm(null)),
                })
              }
            >
              <UserX />
              Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => run(setActive, { ...id, activate: "true" })}>
              <UserCheck />
              Reactivate
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} pending={pending} />

      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>{name}</DialogDescription>
          </DialogHeader>
          <Select items={roles} value={newRole} onValueChange={(v) => setNewRole(String(v ?? ""))}>
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
          <DialogFooter>
            <Button disabled={pending} onClick={() => run(changeRole, { ...id, role: newRole }, () => setRoleOpen(false))}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={endsOpen} onOpenChange={setEndsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Access end date</DialogTitle>
            <DialogDescription>{name}&apos;s access ends at the end of this day. Leave empty for no end date.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="ends">End date</Label>
            <Input id="ends" type="date" value={newEnds} onChange={(e) => setNewEnds(e.target.value)} />
          </div>
          <DialogFooter>
            <Button disabled={pending} onClick={() => run(setAccessEnds, { ...id, accessEnds: newEnds }, () => setEndsOpen(false))}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
