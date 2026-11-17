"use client";
import { confirmUpload, requestUpload } from "@/app/(app)/files/actions";

type Target = { ticketId?: string; projectId?: string; designId?: string };

/** Uploads one file straight to storage and records it. Returns the new file's id. */
export async function uploadFile(target: Target, file: File, onProgress?: (pct: number) => void): Promise<string> {
  const ticket = await requestUpload(target, { name: file.name, type: file.type, size: file.size });
  if ("error" in ticket && ticket.error) throw new Error(ticket.error);
  const { url, key, type } = ticket as { url: string; key: string; type: string };
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload of ${file.name} failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error(`Upload of ${file.name} failed. Check your connection.`));
    xhr.send(file);
  });
  const r = await confirmUpload(target, { key, name: file.name });
  if (r.error || !r.id) throw new Error(r.error ?? `Couldn't save ${file.name}.`);
  return r.id;
}
