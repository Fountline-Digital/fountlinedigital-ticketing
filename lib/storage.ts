import "server-only";
import { randomBytes } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 speaks the S3 API. The bucket is private: every upload and download
// goes through a short-lived signed link that the app hands out after checking access.

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

let client: S3Client | null = null;
function r2() {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY") },
  });
  return client;
}
const bucket = () => env("R2_BUCKET");

export const DEFAULT_ALLOWED_TYPES = [
  "jpg", "jpeg", "png", "gif", "webp", "svg", "heic",
  "pdf", "txt", "csv",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "ai", "psd", "eps", "fig", "sketch",
  "zip", "mp4", "mov", "mp3", "wav",
];

export const extensionOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "file";

/** {org}/{client}/{project}/{ticket}/{yyyymmdd}-{random}-{name}, all lowercase (see naming conventions). */
export function buildStorageKey(parts: { org: string; client?: string | null; project?: string | null; ticket?: string | null; fileName: string }) {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const rand = randomBytes(3).toString("hex");
  return [slug(parts.org), slug(parts.client ?? "internal"), slug(parts.project ?? "general"), slug(parts.ticket ?? "files"), `${date}-${rand}-${slug(parts.fileName)}`].join("/");
}

/** Signed link the browser uploads to directly (PUT), valid for 10 minutes. */
export function signedUploadUrl(key: string, contentType: string) {
  return getSignedUrl(r2(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }), { expiresIn: 600 });
}

/** Signed download link, valid for 5 minutes, saved under the original file name. */
export function signedDownloadUrl(key: string, fileName: string, inline = false) {
  const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(fileName)}`;
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseContentDisposition: disposition }), { expiresIn: 300 });
}

/** Size and type of an uploaded object, or null if it isn't there. */
export async function headObject(key: string) {
  try {
    const r = await r2().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: r.ContentLength ?? 0, type: r.ContentType ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

/** Server-side upload (used by the audit archive). */
export async function putObject(key: string, body: Uint8Array | string, contentType: string, contentEncoding?: string) {
  await r2().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType, ContentEncoding: contentEncoding }));
}

export async function deleteObject(key: string) {
  await r2().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
