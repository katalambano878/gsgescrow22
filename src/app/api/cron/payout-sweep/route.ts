import { NextResponse } from "next/server";
import { isDbLive } from "@/lib/env";
import { reconcileSweep } from "@/lib/actions/transaction";
import { assertCronAuthorized } from "@/lib/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await assertCronAuthorized();
  if (denied) return denied;
  if (!isDbLive) {
    return NextResponse.json({ ok: true, reconciled: 0, note: "DB not configured" });
  }
  const result = await reconcileSweep();
  return NextResponse.json({ ok: true, ...result });
}
