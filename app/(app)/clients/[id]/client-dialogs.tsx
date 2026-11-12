"use client";
import { useActionState, useState, useTransition } from "react";
import { Loader2, Mail, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFormToast } from "@/hooks/use-form-toast";
import { inviteContact, removeContact, saveContact, updateClient, type FormState, type Result } from "../actions";

type ClientInfo = { id: string; name: string; website: string; phone: string; notes: string; status: string };
type Contact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  isPrimary: boolean;
  isApprover: boolean;
  isBilling: boolean;
  hasLogin: boolean;
};

const STATUS_ITEMS = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

export function EditClientDialog({ client }: { client: ClientInfo }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(updateClient, {});
  const [status, setStatus] = useState(client.status);
  useFormToast(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Pencil />
        Edit client
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
          <DialogDescription>The client code can&apos;t change.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="clientId" value={client.id} />
          <div className="grid gap-2">
            <Label htmlFor="e-name">Business name</Label>
            <Input id="e-name" name="name" defaultValue={client.name} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="e-web">Website</Label>
              <Input id="e-web" name="website" defaultValue={client.website} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="e-phone">Phone</Label>
              <Input id="e-phone" name="phone" defaultValue={client.phone} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="e-notes">Internal notes</Label>
            <Textarea id="e-notes" name="notes" defaultValue={client.notes} rows={4} placeholder="Only your team sees this" />
          </div>
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select items={STATUS_ITEMS} name="status" value={status} onValueChange={(v) => setStatus(String(v ?? "active"))}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ITEMS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ContactDialog({
  clientId,
  contact,
  open: controlledOpen,
  onOpenChange,
}: {
  clientId: string;
  contact?: Contact;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;
  const [state, action, pending] = useActionState<FormState, FormData>(saveContact, {});
  useFormToast(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!contact && (
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <Plus />
          Add contact
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit contact" : "Add contact"}</DialogTitle>
          <DialogDescription>Adding a contact doesn&apos;t give them a login. Use &quot;Invite to portal&quot; for that.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="contactId" value={contact?.id ?? ""} />
          <div className="grid gap-2">
            <Label htmlFor="ct-name">Name</Label>
            <Input id="ct-name" name="name" defaultValue={contact?.name} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="ct-email">Email</Label>
              <Input id="ct-email" name="email" type="email" defaultValue={contact?.email} required readOnly={contact?.hasLogin} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ct-phone">Phone</Label>
              <Input id="ct-phone" name="phone" type="tel" defaultValue={contact?.phone} />
            </div>
          </div>
          <div className="grid gap-3">
            <Label>Roles</Label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="isPrimary" defaultChecked={contact?.isPrimary ?? false} /> Primary contact
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="isApprover" defaultChecked={contact?.isApprover ?? true} /> Approver (phases and change requests)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="isBilling" defaultChecked={contact?.isBilling ?? false} /> Billing
            </label>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {contact ? "Save contact" : "Add contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ContactRowActions({ clientId, contact }: { clientId: string; contact: Contact }) {
  const [editOpen, setEditOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      if (r.ok) toast.success(r.ok);
      after?.();
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Contact actions">
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          {!contact.hasLogin && (
            <DropdownMenuItem disabled={pending} onClick={() => run(() => inviteContact(contact.id))}>
              <Mail />
              Invite to portal
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setRemoveOpen(true)}>
            <Trash2 />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ContactDialog clientId={clientId} contact={contact} open={editOpen} onOpenChange={setEditOpen} />

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {contact.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;re removed from this client&apos;s contacts.
              {contact.hasLogin && " Their portal login stays until you deactivate it in Users & invites."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={pending} onClick={() => run(() => removeContact(contact.id), () => setRemoveOpen(false))}>
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
