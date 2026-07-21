import { NextResponse } from "next/server";
import {
  readObject,
  verifyReadToken,
  type StorageBucket,
} from "@/lib/storage";

export const runtime = "nodejs";

const BUCKETS = new Set<StorageBucket>(["kyc", "evidence", "public", "listings"]);

export async function GET(
  req: Request,
  ctx: { params: Promise<{ bucket: string; path: string[] }> },
) {
  const { bucket: rawBucket, path: pathParts } = await ctx.params;
  const bucket = rawBucket as StorageBucket;
  if (!BUCKETS.has(bucket)) {
    return NextResponse.json({ error: "Unknown bucket" }, { status: 404 });
  }
  const objectPath = pathParts.map(decodeURIComponent).join("/");
  const url = new URL(req.url);
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";

  if (!verifyReadToken(bucket, objectPath, exp, sig)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const obj = await readObject(bucket, objectPath);
  if (!obj) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(obj.data), {
    status: 200,
    headers: {
      "Content-Type": obj.contentType,
      "Cache-Control": "private, max-age=60",
    },
  });
}
