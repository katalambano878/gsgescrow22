import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { paystack } from "@/lib/payments/paystack";
import { markPaidCore } from "@/lib/txn/mark-paid";
import { getDb } from "@/lib/db/client";
import { webhooksLog } from "@/lib/db/schema";
import { isDbLive, isPaystackLive } from "@/lib/env";
import { audit } from "@/lib/audit/log";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = (await headers()).get("x-paystack-signature") ?? "";

  // Card checkout is disabled unless Paystack keys exist — never process (or
  // ack unsigned) Paystack events in that mode, even if Moolre is primary.
  if (!isPaystackLive) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const sigOk = paystack.verifyWebhookSignature(raw, sig);
  let event = "unknown";
  let data: Record<string, unknown> = {};
  try {
    const parsed = paystack.parseWebhookEvent(raw);
    event = parsed.event;
    data = parsed.data as Record<string, unknown>;
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }

  const idempotencyKey = (data?.id ?? data?.reference ?? "").toString();

  if (isDbLive) {
    try {
      await getDb().insert(webhooksLog).values({
        provider: "paystack",
        event,
        signatureOk: sigOk,
        idempotencyKey: idempotencyKey || null,
        raw: { event, data } as Record<string, unknown>,
        processedAt: new Date(),
      }).onConflictDoNothing();
    } catch {}
  }

  if (!sigOk) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  await audit({
    action: "webhook.received",
    targetType: "psp_event",
    targetId: idempotencyKey || undefined,
    payload: { event, data: data ?? {} },
  });

  if (event === "charge.success") {
    const reference = (data as { reference?: string }).reference;
    if (reference && isDbLive) {
      const r = await markPaidCore(reference);
      if (!r.ok) {
        return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
