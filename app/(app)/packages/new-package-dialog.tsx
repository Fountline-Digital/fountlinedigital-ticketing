"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
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
import { createPackage, type FormState } from "./actions";

type Combo = { serviceLineId: string; tierId: string; label: string };

export function NewPackageDialog({ options }: { options: Combo[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(createPackage, {});
  const [choice, setChoice] = useState("");
  const handled = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!state.at || handled.current === state.at) return;
    handled.current = state.at;
    if (state.error) toast.error(state.error);
  }, [state.at, state.error]);

  const items = options.map((o) => ({ value: `${o.serviceLineId}:${o.tierId}`, label: o.label }));
  const [serviceLineId, tierId] = choice ? choice.split(":") : ["", ""];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus />
        New package
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New package</DialogTitle>
          <DialogDescription>
            {items.length === 0
              ? "Every service line already has a package for every tier. Add a service line or tier in Settings to create more."
              : "Pick the service line and tier. It starts as a draft with an empty template."}
          </DialogDescription>
        </DialogHeader>
        {items.length > 0 && (
          <form action={action} className="grid gap-4">
            <input type="hidden" name="serviceLineId" value={serviceLineId} />
            <input type="hidden" name="tierId" value={tierId} />
            <div className="grid gap-2">
              <Label>Service line and tier</Label>
              <Select items={items} value={choice} onValueChange={(v) => setChoice(String(v ?? ""))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pkg-name">Name (optional)</Label>
              <Input id="pkg-name" name="name" placeholder="Defaults to service line + tier" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending || !choice}>
                {pending && <Loader2 className="animate-spin" />}
                Create package
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
