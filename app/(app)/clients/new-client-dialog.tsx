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
import { Separator } from "@/components/ui/separator";
import { useFormToast } from "@/hooks/use-form-toast";
import { createClient, type FormState } from "./actions";

// "Acme Landscaping" -> "ACMELA" (first letters, up to 6). Editable.
const suggestCode = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w.slice(0, 4) : w.slice(0, 2)))
    .join("")
    .slice(0, 6);

export function NewClientDialog() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(createClient, {});
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  useFormToast(state);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus />
        New client
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New client</DialogTitle>
          <DialogDescription>The code becomes part of their key, like FDC-ACME. It can&apos;t change later.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <div className="grid gap-2">
              <Label htmlFor="c-name">Business name</Label>
              <Input
                id="c-name"
                name="name"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!codeTouched) setCode(suggestCode(e.target.value));
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="c-code">Code</Label>
              <Input
                id="c-code"
                name="code"
                required
                maxLength={6}
                value={code}
                onChange={(e) => {
                  setCodeTouched(true);
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
                }}
                className="font-mono uppercase"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="c-web">Website</Label>
              <Input id="c-web" name="website" placeholder="https://" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="c-phone">Phone</Label>
              <Input id="c-phone" name="phone" type="tel" />
            </div>
          </div>
          <Separator />
          <p className="text-sm font-medium">Main contact (optional)</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="c-cname">Name</Label>
              <Input id="c-cname" name="contactName" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="c-cemail">Email</Label>
              <Input id="c-cemail" name="contactEmail" type="email" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Create client
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
