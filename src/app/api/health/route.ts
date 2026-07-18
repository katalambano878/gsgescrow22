import { NextResponse } from "next/server";
import {
  isAuthLive,
  isDbLive,
  isMoolreLive,
  isPaymentsLive,
  isSmsLive,
  env,
} from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness + coarse dependency probe for uptime monitors.
 * Returns HTTP 503 when a hard dependency (DB) is configured-but-unreachable
 * or when production is missing DATABASE_URL entirely.
 */
export async function GET() {
  let dbReachable = false;
  if (isDbLive) {
    try {
      const { sql } = await import("drizzle-orm");
      const { getDb } = await import("@/lib/db/client");
      await getDb().execute(sql`select 1`);
      dbReachable = true;
    } catch {
      dbReachable = false;
    }
  }

  const services = {
    db: isDbLive && dbReachable === true,
    dbConfigured: isDbLive,
    auth: isAuthLive,
    payments: isPaymentsLive,
    moolre: isMoolreLive,
    sms: isSmsLive,
    cronSecret: Boolean(env.CRON_SECRET?.trim()),
  };

  const hardOk = services.db;
  return NextResponse.json(
    {
      ok: hardOk,
      name: "sbbs",
      version: "0.1.0",
      services,
      time: new Date().toISOString(),
    },
    { status: hardOk ? 200 : 503 },
  );
}
