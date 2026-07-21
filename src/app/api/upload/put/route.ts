import { NextResponse } from "next/server";
import {
  MAX_FILE_BYTES,
  verifyUploadToken,
  writeObject,
  type StorageBucket,
} from "@/lib/storage";

export const runtime = "nodejs";

const BUCKETS = new Set<StorageBucket>(["kyc", "evidence", "public", "listings"]);

export async function PUT(req: Request) {
  const url = new URL(req.url);
  const bucket = url.searchParams.get("bucket") as StorageBucket | null;
  const objectPath = url.searchParams.get("path");
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig");

  if (!bucket || !BUCKETS.has(bucket) || !objectPath || !sig) {
    return NextResponse.json({ ok: false, error: "Invalid upload URL" }, { status: 400 });
  }
  if (!verifyUploadToken(bucket, objectPath, exp, sig)) {
    return NextResponse.json({ ok: false, error: "Upload URL expired or invalid" }, { status: 403 });
  }

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.byteLength === 0) {
    return NextResponse.json({ ok: false, error: "Empty body" }, { status: 400 });
  }
  if (buf.byteLength > MAX_FILE_BYTES) {
    return NextResponse.json({ ok: false, error: "File too large" }, { status: 413 });
  }

  const contentType = req.headers.get("content-type") ?? "application/octet-stream";
  await writeObject(bucket, objectPath, buf, contentType);
  return NextResponse.json({ ok: true, path: objectPath });
}
