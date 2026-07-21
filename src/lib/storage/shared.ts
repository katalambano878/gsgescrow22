/**
 * Client-safe storage helpers (no Node fs). Server disk I/O lives in `./server`.
 */

export const STORAGE_BUCKETS = {
  kyc: "sbbs-kyc",
  evidence: "sbbs-evidence",
  public: "sbbs-public",
  listings: "sbbs-listings",
} as const;

export type StorageBucket = keyof typeof STORAGE_BUCKETS;

export function publicListingUrl(objectPath: string | null | undefined): string | null {
  if (!objectPath) return null;
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (!base) return null;
  return `${base}/api/storage/public/listings/${objectPath.replace(/^\/+/, "")}`;
}

export function generateStoragePath(opts: {
  scope: "kyc" | "evidence" | "listing";
  userId: string;
  originalName: string;
  subKey?: string;
}): string {
  const ext = opts.originalName.includes(".")
    ? opts.originalName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "bin"
    : "bin";
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${opts.userId}/${opts.subKey ? `${opts.subKey}/` : ""}${ts}-${rand}.${ext}`;
}

export const ALLOWED_KYC_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

export const ALLOWED_EVIDENCE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
  "video/mp4",
  "video/quicktime",
];

export const ALLOWED_LISTING_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const MAX_FILE_BYTES = 12 * 1024 * 1024;
