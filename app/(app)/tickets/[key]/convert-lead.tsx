"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { convertLead, type ConvertInput } from "../../leads/actions";

export function ConvertLead({
  ticketId,
  defaults,
  packages,
  suggestedPackageKey,
}: {
  ticketId: string;
  defaults: Omit<ConvertInput, "packageId" | "startDate" | "invite">;
  packages: { value: string; label: string }[];
  suggestedPackageKey: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Labels look like "FD-WEB-BUS · Web Business"; match the key exactly first
  const guess = suggestedPackageKey
    ? (packages.find((p) => p.label.split(" · ")[0].toLowerCase() === suggestedPackageKey.toLowerCase()) ??
      packages.find((p) => p.label.toLowerCase().includes(suggestedPackageKey.toLowerCase())))
    : undefined;
  const [v, setV] = useState<ConvertInput>({ ...defaults, packageId: guess?.value ?? "", startDate: new Date().toISOString().slice(0, 10), invite: true });
  const [pending, start] = useTransition();
  const set = <K extends keyof ConvertInput>(k: K, value: ConvertInput[K]) => setV((s) => ({ ...s, [k]: value }));

  return (
    <>
      <Button className="w-full" onClick={() => setOpen(true)}>
        <UserPlus /> Convert to client
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Convert to client</DialogTitle>
            <DialogDescription>Creates the client and main contact, the project, and sends the portal invite. The lead is marked Won.</DialogDescription>
          </DialogHeader>
          <form
            id="convert-form"
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await convertLead(ticketId, v);
                if (r.error) toast.error(r.error);
                else {
                  toast.success(r.ok);
                  setOpen(false);
                  if (r.href) router.push(r.href);
                }
              });
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="cv-name">Client name</Label>
              <Input id="cv-name" value={v.clientName} onChange={(e) => set("clientName", e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cv-code">Code</Label>
              <Input id="cv-code" value={v.code} maxLength={6} className="font-mono uppercase" onChange={(e) => set("code", e.target.value.toUpperCase())} required />
              <p className="text-xs text-muted-foreground">2-6 letters, used in keys like FDC-{v.code || "ACME"}.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cv-contact">Main contact</Label>
              <Input id="cv-contact" value={v.contactName} onChange={(e) => set("contactName", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cv-email">Contact email</Label>
              <Input id="cv-email" type="email" value={v.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} required />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="cv-package">Package</Label>
              <select id="cv-package" value={v.packageId} onChange={(e) => set("packageId", e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                <option value="">No project yet (client only)</option>
                {packages.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            {v.packageId && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="cv-project">Project name</Label>
                  <Input id="cv-project" value={v.projectName} onChange={(e) => set("projectName", e.target.value)} required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cv-start">Start date</Label>
                  <Input id="cv-start" type="date" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} />
                </div>
              </>
            )}
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <Checkbox className="mt-0.5" checked={v.invite} onCheckedChange={(c) => set("invite", Boolean(c))} />
              <span>Send the portal invite now. They&apos;ll see the intake questionnaire as soon as they sign in.</span>
            </label>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="convert-form" disabled={pending}>
              {pending ? "Converting…" : "Convert"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
