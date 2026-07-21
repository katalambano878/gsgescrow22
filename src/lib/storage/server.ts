import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { STORAGE_BUCKETS, type StorageBucket } from "./shared";

export type { StorageBucket } from "./shared";
export {
  STORAGE_BUCKETS,
  publicListingUrl,
  generateStoragePath,
  ALLOWED_KYC_MIMES,
  ALLOWED_EVIDENCE_MIMES,
  ALLOWED_LISTING_IMAGE_MIMES,
  MAX_FILE_BYTES,
} from "./shared";

function storageRoot(): string {
  return env.STORAGE_ROOT || path.join(process.cwd(), ".data", "storage");
}

function signingSecret(): string {
  const s = env.STORAGE_SIGNING_SECRET || env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("STORAGE_SIGNING_SECRET or AUTH_SECRET required for storage");
  }
  return s;
}

function bucketDir(bucket: StorageBucket): string {
  return path.join(storageRoot(), STORAGE_BUCKETS[bucket]);
}

function safeJoin(root: string, objectPath: string): string {
  const cleaned = objectPath.replace(/^\/+/, "").replace(/\0/g, "");
  if (cleaned.includes("..")) throw new Error("Invalid path");
  const full = path.resolve(root, cleaned);
  if (!full.startsWith(path.resolve(root) + path.sep) && full !== path.resolve(root)) {
    throw new Error("Path escapes storage root");
  }
  return full;
}

export async function createSignedUploadUrl(
  bucket: StorageBucket,
  objectPath: string,
): Promise<{ ok: boolean; signedUrl?: string; token?: string; path?: string; error?: string }> {
  try {
    await mkdir(bucketDir(bucket), { recursive: true });
    const exp = Math.floor(Date.now() / 1000) + 5 * 60;
    const token = signUploadToken(bucket, objectPath, exp);
    const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
    const signedUrl = `${base}/api/upload/put?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(objectPath)}&exp=${exp}&sig=${encodeURIComponent(token)}`;
    return { ok: true, signedUrl, token, path: objectPath };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function signUploadToken(bucket: StorageBucket, objectPath: string, exp: number): string {
  const payload = `upload:${bucket}:${objectPath}:${exp}`;
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

export function verifyUploadToken(
  bucket: StorageBucket,
  objectPath: string,
  exp: number,
  sig: string,
): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = signUploadToken(bucket, objectPath, exp);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function writeObject(
  bucket: StorageBucket,
  objectPath: string,
  data: Buffer,
  contentType?: string,
): Promise<void> {
  const full = safeJoin(bucketDir(bucket), objectPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  if (contentType) {
    await writeFile(`${full}.meta.json`, JSON.stringify({ contentType }), "utf8");
  }
}

export async function readObject(
  bucket: StorageBucket,
  objectPath: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  try {
    const full = safeJoin(bucketDir(bucket), objectPath);
    await access(full);
    const data = await readFile(full);
    let contentType = "application/octet-stream";
    try {
      const meta = JSON.parse(await readFile(`${full}.meta.json`, "utf8")) as {
        contentType?: string;
      };
      if (meta.contentType) contentType = meta.contentType;
    } catch {
      // no meta
    }
    return { data, contentType };
  } catch {
    return null;
  }
}

export async function createSignedReadUrl(
  bucket: StorageBucket,
  objectPath: string,
  ttlSeconds = 60 * 15,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = `read:${bucket}:${objectPath}:${exp}`;
    const sig = createHmac("sha256", signingSecret()).update(payload).digest("base64url");
    const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
    const url = `${base}/api/storage/sign/${bucket}/${objectPath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}?exp=${exp}&sig=${encodeURIComponent(sig)}`;
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function verifyReadToken(
  bucket: StorageBucket,
  objectPath: string,
  exp: number,
  sig: string,
): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const payload = `read:${bucket}:${objectPath}:${exp}`;
  const expected = createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
