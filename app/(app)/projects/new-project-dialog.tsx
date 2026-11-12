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
import { useFormToast } from "@/hooks/use-form-toast";
import { createProject, type FormState } from "./actions";

type Option = { value: string; label: string };

export function NewProjectDialog({
  clients,
  packages,
  defaultClientId,
}: {
  clients: Option[];
  packages: (Option & { name: string })[];
  defaultClientId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(createProject, {});
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [packageId, setPackageId] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  useFormToast(state);

  const suggest = (cId: string, pId: string) => {
    if (nameTouched) return;
    const c = clients.find((x) => x.value === cId)?.label;
    const p = packages.find((x) => x.value === pId)?.name;
    if (c && p) setName(`${c} - ${p}`);
  };

  const ready = clients.length > 0 && packages.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size={defaultClientId ? "sm" : "default"} variant={defaultClientId ? "outline" : "default"} />}>
        <Plus />
        New project
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            {ready
              ? "Uses the package's live template: every phase and task is created as tickets."
              : packages.length === 0
                ? "No active packages yet. Activate one in Packages first."
                : "Add a client first."}
          </DialogDescription>
        </DialogHeader>
        {ready && (
          <form action={action} className="grid gap-4">
            <input type="hidden" name="clientId" value={clientId} />
            <input type="hidden" name="packageId" value={packageId} />
            <div className="grid gap-2">
              <Label>Client</Label>
              <Select
                items={clients}
                value={clientId}
                onValueChange={(v) => {
                  const id = String(v ?? "");
                  setClientId(id);
                  suggest(id, packageId);
                }}
              >
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
              <Label>Package</Label>
              <Select
                items={packages}
                value={packageId}
                onValueChange={(v) => {
                  const id = String(v ?? "");
                  setPackageId(id);
                  suggest(clientId, id);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a package" />
                </SelectTrigger>
                <SelectContent>
                  {packages.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-name">Project name</Label>
              <Input
                id="p-name"
                name="name"
                required
                value={name}
                onChange={(e) => {
                  setNameTouched(true);
                  setName(e.target.value);
                }}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="p-start">Start date</Label>
                <Input id="p-start" name="startDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-launch">Target launch</Label>
                <Input id="p-launch" name="targetLaunchDate" type="date" />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending || !clientId || !packageId}>
                {pending && <Loader2 className="animate-spin" />}
                Create project
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
