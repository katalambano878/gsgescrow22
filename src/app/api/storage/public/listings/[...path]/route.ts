import { NextResponse } from "next/server";
import { readObject } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path: pathParts } = await ctx.params;
  const objectPath = pathParts.map(decodeURIComponent).join("/");
  const obj = await readObject("listings", objectPath);
  if (!obj) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(obj.data), {
    status: 200,
    headers: {
      "Content-Type": obj.contentType,
      "Cache-Control": "public, max-age=3600, immutable",
    },
  });
}
