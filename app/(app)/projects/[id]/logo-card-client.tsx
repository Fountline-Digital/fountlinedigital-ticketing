"use client";
import { useRef, useState, useTransition } from "react";
import { ImagePlus, Plus, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadFile } from "@/lib/upload-client";
import { addConcept, deleteDraftBatch, publishBatch, removeConcept, startBatch, type Result } from "./logo-actions";

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

export function StartBatchButton({ projectId }: { projectId: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => startBatch(projectId))}>
      <Plus /> Start a batch
    </Button>
  );
}

export function DraftBatch({
  batchId,
  projectId,
  target,
  concepts,
}: {
  batchId: string;
  projectId: string;
  target: number | null;
  concepts: { id: string; key: string; fileId: string; name: string }[];
}) {
  const { pending, run } = useRun();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  async function add(list: FileList | null) {
    if (!list) return;
    for (const file of Array.from(list)) {
      setUploading((n) => n + 1);
      try {
        const fileId = await uploadFile({ projectId }, file);
        const r = await addConcept(batchId, fileId);
        if (r.error) toast.error(r.error);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Couldn't upload ${file.name}.`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (input.current) input.current.value = "";
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {concepts.map((c, i) => (
          <div key={c.id} className="group relative overflow-hidden rounded border bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/files/${c.fileId}?view=1`} alt={c.name} className="aspect-square w-full object-contain p-1" />
            <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 font-mono text-[10px] text-white">{i + 1}</span>
            <Button
              size="icon-xs"
              variant="secondary"
              className="absolute top-1 right-1"
              aria-label={`Remove concept ${i + 1}`}
              disabled={pending}
              onClick={() => run(() => removeConcept(c.id))}
            >
              <X />
            </Button>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {concepts.length}
        {target ? ` of ${target}` : ""} concepts. Upload images (PNG/JPG/SVG); they stay hidden from the client until you publish.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={uploading > 0} onClick={() => input.current?.click()}>
          <ImagePlus /> {uploading ? `Uploading ${uploading}…` : "Add concepts"}
        </Button>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple hidden onChange={(e) => void add(e.currentTarget.files)} />
        <Button
          size="sm"
          disabled={pending || uploading > 0 || concepts.length === 0}
          onClick={() => confirm(`Publish ${concepts.length} concept${concepts.length === 1 ? "" : "s"} to the client?`) && run(() => publishBatch(batchId))}
        >
          <Send /> Publish to client
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={pending} onClick={() => confirm("Discard this draft batch?") && run(() => deleteDraftBatch(batchId))}>
          <Trash2 /> Discard
        </Button>
      </div>
    </div>
  );
}
