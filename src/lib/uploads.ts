import "server-only";

import path from "node:path";
import { mkdir } from "node:fs/promises";

export const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB

const BLOCKED_MIME_PREFIXES = ["application/x-msdownload", "application/x-executable"];

export function isAllowedMimeType(mimeType: string) {
  if (!mimeType) return false;
  if (BLOCKED_MIME_PREFIXES.some((p) => mimeType.startsWith(p))) return false;
  // Prototype: allow common media + docs + archives people paste/share
  return (
    mimeType.startsWith("image/") ||
    mimeType.startsWith("video/") ||
    mimeType.startsWith("audio/") ||
    mimeType === "application/pdf" ||
    mimeType === "application/zip" ||
    mimeType === "application/json" ||
    mimeType === "text/plain" ||
    mimeType === "text/csv" ||
    mimeType.startsWith("application/vnd.") ||
    mimeType === "application/octet-stream"
  );
}

export function sanitizeFilename(name: string) {
  const base = path.basename(name).replace(/[^\w.\- ()[\]]+/g, "_");
  return base.slice(0, 180) || "file";
}

export async function ensureUploadDir(threadId: string) {
  const dir = path.join(UPLOAD_ROOT, threadId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export function absoluteUploadPath(storageKey: string) {
  const resolved = path.resolve(UPLOAD_ROOT, storageKey);
  if (!resolved.startsWith(path.resolve(UPLOAD_ROOT))) {
    throw new Error("Invalid storage key");
  }
  return resolved;
}
