import { NextResponse } from "next/server";
import { desc, gt } from "drizzle-orm";
import { getCurrentProfile, isAdminRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { alerts, payouts, transactionEvents, transactions } from "@/lib/db/schema";
import { isDbLive } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Lightweight admin poll endpoint replacing Supabase Realtime.
 * Returns recent rows as pseudo-events for the live ticker.
 */
export async function GET(req: Request) {
  if (!isDbLive) {
    return NextResponse.json({ ok: false, error: "DB not configured" }, { status: 503 });
  }
  const profile = await getCurrentProfile();
  if (!profile || (!isAdminRole(profile.role) && profile.role !== "approver")) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const sinceRaw = url.searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : new Date(Date.now() - 60_000);
  const sinceOk = !Number.isNaN(since.getTime()) ? since : new Date(Date.now() - 60_000);

  const db = getDb();
  const events: Array<{
    table: string;
    eventType: "INSERT" | "UPDATE";
    row: Record<string, unknown>;
    receivedAt: string;
  }> = [];

  const [txnRows, payoutRows, alertRows, evtRows] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(gt(transactions.updatedAt, sinceOk))
      .orderBy(desc(transactions.updatedAt))
      .limit(20),
    db
      .select()
      .from(payouts)
      .where(gt(payouts.updatedAt, sinceOk))
      .orderBy(desc(payouts.updatedAt))
      .limit(20),
    db
      .select()
      .from(alerts)
      .where(gt(alerts.createdAt, sinceOk))
      .orderBy(desc(alerts.createdAt))
      .limit(20),
    db
      .select()
      .from(transactionEvents)
      .where(gt(transactionEvents.createdAt, sinceOk))
      .orderBy(desc(transactionEvents.createdAt))
      .limit(20),
  ]);

  for (const row of txnRows) {
    events.push({
      table: "transactions",
      eventType: "UPDATE",
      row: row as unknown as Record<string, unknown>,
      receivedAt: row.updatedAt.toISOString(),
    });
  }
  for (const row of payoutRows) {
    events.push({
      table: "payouts",
      eventType: "UPDATE",
      row: row as unknown as Record<string, unknown>,
      receivedAt: row.updatedAt.toISOString(),
    });
  }
  for (const row of alertRows) {
    events.push({
      table: "alerts",
      eventType: "INSERT",
      row: row as unknown as Record<string, unknown>,
      receivedAt: row.createdAt.toISOString(),
    });
  }
  for (const row of evtRows) {
    events.push({
      table: "transaction_events",
      eventType: "INSERT",
      row: row as unknown as Record<string, unknown>,
      receivedAt: row.createdAt.toISOString(),
    });
  }

  events.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));

  return NextResponse.json({ ok: true, events: events.slice(0, 40) });
}
