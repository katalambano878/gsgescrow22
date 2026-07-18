import { NextResponse } from "next/server";
import { autoReleaseSweep } from "@/lib/actions/transaction";
import { isDbLive } from "@/lib/env";
import { assertCronAuthorized } from "@/lib/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await assertCronAuthorized();
  if (denied) return denied;
  if (!isDbLive) {
    return NextResponse.json({ ok: true, released: 0, note: "DB not configured" });
  }
  const result = await autoReleaseSweep();
  return NextResponse.json({ ok: true, ...result });
}
