"use client";
import { useActionState, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { useFormToast } from "@/hooks/use-form-toast";
import { createTicket, type FormState } from "./actions";

type Option = { value: string; label: string };
const NO_PHASE = "__none";

export function NewTicketDialog({
  types,
  projectId,
  phases,
  defaultTypeId,
}: {
  types: Option[];
  projectId?: string;
  phases?: Option[];
  defaultTypeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(createTicket, {});
  const [typeId, setTypeId] = useState(defaultTypeId ?? types[0]?.value ?? "");
  const [phaseId, setPhaseId] = useState(NO_PHASE);
  useFormToast(state);
  const phaseItems = [{ value: NO_PHASE, label: "No phase" }, ...(phases ?? [])];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Plus />
        New ticket
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New ticket</DialogTitle>
          <DialogDescription>It&apos;s assigned to you to start. Reassign it on the ticket page.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="typeId" value={typeId} />
          <input type="hidden" name="projectId" value={projectId ?? ""} />
          <input type="hidden" name="phaseId" value={phaseId === NO_PHASE ? "" : phaseId} />
          <div className="grid gap-2">
            <Label htmlFor="nt-title">Title</Label>
            <Input id="nt-title" name="title" required autoFocus />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select items={types} value={typeId} onValueChange={(v) => setTypeId(String(v ?? ""))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {phases && (
              <div className="grid gap-2">
                <Label>Phase</Label>
                <Select items={phaseItems} value={phaseId} onValueChange={(v) => setPhaseId(String(v ?? NO_PHASE))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {phaseItems.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nt-desc">Description</Label>
            <Textarea id="nt-desc" name="description" rows={4} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !typeId}>
              {pending && <Loader2 className="animate-spin" />}
              Create ticket
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
