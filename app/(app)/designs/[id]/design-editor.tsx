"use client";
import { useRef, useState, useTransition } from "react";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uploadFile } from "@/lib/upload-client";
import { addDesignImage, makeCover, removeDesignImage, updateDesign, type DesignInput, type Result } from "../actions";

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else if (r.ok) toast.success(r.ok);
    });
  return { pending, run };
}

const STATUSES = [
  { value: "draft", label: "Draft (not offerable yet)" },
  { value: "active", label: "Active (can be offered)" },
  { value: "hidden", label: "Hidden (no new offers)" },
  { value: "retired", label: "Retired" },
];

export function DesignEditor({ id, initial }: { id: string; initial: DesignInput }) {
  const { pending, run } = useRun();
  const [v, setV] = useState<DesignInput>(initial);
  const set = <K extends keyof DesignInput>(k: K, value: DesignInput[K]) => setV((s) => ({ ...s, [k]: value }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => updateDesign(id, v));
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={v.name} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="status">Status</Label>
            <select id="status" value={v.status} onChange={(e) => set("status", e.target.value as DesignInput["status"])} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={3} value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="Who it suits and what stands out." />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="preview">Live preview link</Label>
            <Input id="preview" type="url" value={v.previewUrl} onChange={(e) => set("previewUrl", e.target.value)} placeholder="https://harbor.demo.fountlinedigital.com" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pages">Included pages</Label>
            <Input id="pages" value={v.pages} onChange={(e) => set("pages", e.target.value)} placeholder="Home, About, Services, Contact" />
            <p className="text-xs text-muted-foreground">Separate with commas.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fonts">Font options (Business)</Label>
            <Input id="fonts" value={v.fonts} onChange={(e) => set("fonts", e.target.value)} placeholder="Montserrat, Playfair Display, Inter" />
            <p className="text-xs text-muted-foreground">Separate with commas.</p>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="palettes">Color palettes (Business)</Label>
            <Textarea id="palettes" rows={4} className="font-mono text-sm" value={v.palettes} onChange={(e) => set("palettes", e.target.value)} placeholder={"#0b1f33, #c0c0c0, #ffffff\n#1d3b2a, #e8dcc4, #ffffff"} />
            <p className="text-xs text-muted-foreground">One palette per line, hex colors separated by commas.</p>
          </div>
          <fieldset className="flex flex-wrap gap-6 sm:col-span-2">
            <legend className="mb-2 text-sm font-medium">Offered on</legend>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={v.inStarterSet} onCheckedChange={(c) => set("inStarterSet", Boolean(c))} /> Essentials (starter set)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={v.inBusiness} onCheckedChange={(c) => set("inBusiness", Boolean(c))} /> Business
            </label>
          </fieldset>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function Screenshots({ designId, images }: { designId: string; images: string[] }) {
  const { pending, run } = useRun();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  async function add(list: FileList | null) {
    if (!list) return;
    for (const file of Array.from(list)) {
      setUploading((n) => n + 1);
      try {
        const fileId = await uploadFile({ designId }, file);
        const r = await addDesignImage(designId, fileId);
        if (r.error) toast.error(r.error);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (input.current) input.current.value = "";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Screenshots</CardTitle>
        <CardDescription>The first one is the cover clients see. Full-page screenshots work best.</CardDescription>
        <CardAction>
          <Button size="sm" variant="outline" disabled={uploading > 0} onClick={() => input.current?.click()}>
            <ImagePlus /> {uploading ? `Uploading ${uploading}…` : "Add"}
          </Button>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => void add(e.currentTarget.files)} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {images.length === 0 && <p className="text-sm text-muted-foreground">No screenshots yet.</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((fileId, i) => (
            <div key={fileId} className="overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/${fileId}?view=1`} alt={`Screenshot ${i + 1}`} className="aspect-[16/10] w-full object-cover object-top" loading="lazy" />
              <div className="flex items-center justify-between p-2 text-xs">
                <span>{i === 0 ? "Cover" : `#${i + 1}`}</span>
                <div className="flex">
                  {i > 0 && (
                    <Button size="icon-xs" variant="ghost" aria-label="Make cover" disabled={pending} onClick={() => run(() => makeCover(designId, fileId))}>
                      <Star />
                    </Button>
                  )}
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    aria-label="Remove screenshot"
                    disabled={pending}
                    onClick={() => confirm("Remove this screenshot?") && run(() => removeDesignImage(designId, fileId))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
