"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Download, Eye, EyeOff, FileText, ImageIcon, Paperclip, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { confirmUpload, deleteFile, requestUpload, setFileVisibility } from "@/app/(app)/files/actions";
import type { FileRow } from "@/lib/file-access";
import { formatBytes } from "@/lib/format";

type Target = { ticketId?: string; projectId?: string };
type Uploading = { id: string; name: string; progress: number };


const previewable = (type: string) => /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/.test(type);

/** PUT straight to R2 with upload progress (fetch can't report upload progress). */
function putWithProgress(url: string, file: File, type: string, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection (or the bucket's CORS settings)."));
    xhr.send(file);
  });
}

export function FilesCard({
  target,
  files,
  canManage,
  description = "Internal unless you share them with the client.",
  portal = false,
  readOnly = false,
}: {
  target: Target;
  files: FileRow[];
  canManage: boolean;
  description?: string;
  portal?: boolean; // client view: no internal/shared toggle
  readOnly?: boolean; // admin preview: no uploads or changes
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Uploading[]>([]);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();

  async function uploadOne(file: File) {
    const id = crypto.randomUUID();
    setUploads((u) => [...u, { id, name: file.name, progress: 0 }]);
    try {
      const ticket = await requestUpload(target, { name: file.name, type: file.type, size: file.size });
      if ("error" in ticket && ticket.error) throw new Error(ticket.error);
      const { url, key, type } = ticket as { url: string; key: string; type: string };
      await putWithProgress(url, file, type, (progress) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress } : x))));
      const r = await confirmUpload(target, { key, name: file.name });
      if (r.error) throw new Error(r.error);
      toast.success(r.ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Couldn't upload ${file.name}.`);
    } finally {
      setUploads((u) => u.filter((x) => x.id !== id));
    }
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    Array.from(list).forEach((f) => void uploadOne(f));
    if (input.current) input.current.value = "";
  }

  const run = (fn: () => Promise<{ ok?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else if (r.ok) toast.success(r.ok);
    });

  return (
    <Card
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!readOnly) addFiles(e.dataTransfer?.files ?? null);
      }}
      className={dragging ? "ring-2 ring-primary" : undefined}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="size-4" />
          Files
        </CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <Button size="sm" variant="outline" disabled={readOnly} onClick={() => input.current?.click()}>
            <Upload /> Upload
          </Button>
          <input ref={input} type="file" multiple hidden onChange={(e) => addFiles(e.currentTarget.files)} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2">
        {uploads.map((u) => (
          <div key={u.id} className="space-y-1 rounded-lg border px-3 py-2">
            <div className="flex justify-between text-sm">
              <span className="truncate">{u.name}</span>
              <span className="text-muted-foreground">{u.progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={u.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${u.name}`}>
              <div className="h-full bg-primary transition-[width]" style={{ width: `${u.progress}%` }} />
            </div>
          </div>
        ))}

        {files.length === 0 && uploads.length === 0 && (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">Drop files here or use Upload.</p>
        )}

        {files.map((f) => {
          const canEdit = !readOnly && (canManage || f.uploadedByMe);
          return (
            <div key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2">
              {f.type.startsWith("image/") ? <ImageIcon className="size-4 shrink-0 text-muted-foreground" /> : <FileText className="size-4 shrink-0 text-muted-foreground" />}
              <div className="min-w-0 flex-1">
                <a
                  href={`/api/files/${f.id}${previewable(f.type) ? "?view=1" : ""}`}
                  target={previewable(f.type) ? "_blank" : undefined}
                  rel="noreferrer"
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {f.name}
                </a>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(f.size)} · {f.uploadedBy} · {f.when}
                  {f.ticketKey && (
                    <>
                      {" · "}
                      <Link href={`/tickets/${f.ticketKey}`} className="font-mono hover:underline">
                        {f.ticketKey}
                      </Link>
                    </>
                  )}
                </p>
              </div>
              {!portal && f.visibility === "client" && <span className="rounded border px-1.5 text-xs text-primary">Client can see</span>}
              <div className="flex items-center">
                <a href={`/api/files/${f.id}`} aria-label={`Download ${f.name}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
                  <Download />
                </a>
                {canEdit && (
                  <>
                    {!portal && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={pending}
                      aria-label={f.visibility === "client" ? `Hide ${f.name} from the client` : `Share ${f.name} with the client`}
                      title={f.visibility === "client" ? "Hide from client" : "Share with client"}
                      onClick={() => run(() => setFileVisibility(f.id, f.visibility === "client" ? "internal" : "client"))}
                    >
                      {f.visibility === "client" ? <EyeOff /> : <Eye />}
                    </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={pending}
                      aria-label={`Delete ${f.name}`}
                      className="text-destructive hover:text-destructive"
                      onClick={() => confirm(`Delete ${f.name}? It goes to Trash for 30 days.`) && run(() => deleteFile(f.id))}
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
