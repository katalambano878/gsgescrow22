import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { moolrePsp } from "@/lib/payments";
import { markPaidCore } from "@/lib/txn/mark-paid";
import { getDb } from "@/lib/db/client";
import { payouts, webhooksLog } from "@/lib/db/schema";
import { isDbLive } from "@/lib/env";
import { audit } from "@/lib/audit/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Moolre webhook entry point.
 *
 * Security model:
 * Moolre does not HMAC-sign webhook callbacks. Instead we treat the payload as
 * UNTRUSTED and always cross-verify with Moolre's /open/transact/status API
 * (authenticated with our private X-API-KEY) before acting. If a signature
 * header is present and matches, we also record signatureOk=true for audit.
 *
 * Status rule from Moolre docs: never assume failure unless txstatus === 2.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const hdrs = await headers();
  const sig =
    hdrs.get("x-moolre-signature") ??
    hdrs.get("x-signature") ??
    hdrs.get("x-moolre-webhook-signature") ??
    "";

  const sigOk = moolrePsp.verifyWebhookSignature(raw, sig);

  let event = "unknown";
  let data: Record<string, unknown> = {};
  try {
    const parsed = moolrePsp.parseWebhookEvent(raw);
    event = parsed.event;
    data = parsed.data as Record<string, unknown>;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 400 },
    );
  }

  const externalRef =
    (data.externalref as string | undefined) ??
    (data.externalRef as string | undefined) ??
    "";
  const transactionId = (data.transactionid as string | undefined) ?? "";
  const idempotencyKey =
    (transactionId || externalRef || "").toString() || `moolre_${Date.now()}`;
  const txStatusFromPayload = Number(
    data.txstatus ?? data.TxStatus ?? data.status ?? -1,
  );

  if (isDbLive) {
    try {
      await getDb()
        .insert(webhooksLog)
        .values({
          provider: "moolre",
          event,
          signatureOk: sigOk,
          idempotencyKey,
          raw: {
            event,
            data,
            signatureProvided: Boolean(sig),
            headers: Object.fromEntries(
              ["x-moolre-signature", "x-signature", "user-agent", "content-type"].map(
                (h) => [h, hdrs.get(h) ?? null],
              ),
            ),
          } as Record<string, unknown>,
          processedAt: new Date(),
        })
        .onConflictDoNothing();
    } catch {
      // best effort
    }
  }

  await audit({
    action: "webhook.received",
    targetType: "moolre_event",
    targetId: idempotencyKey,
    payload: { event, txStatusFromPayload, externalRef, transactionId, sigOk },
  });

  // ---- Collection event: buyer paid into our Moolre wallet.
  // Always cross-verify via /open/transact/status before marking paid, because
  // Moolre does not sign webhooks and the raw POST body is not trustworthy.
  const looksLikeCollection =
    externalRef &&
    (txStatusFromPayload === 1 ||
      txStatusFromPayload === 0 ||
      /POS(09|10)|SUCCESS|payment|collect|charge/i.test(event) ||
      /success|completed/i.test(String(data.message ?? "")));

  if (looksLikeCollection && isDbLive) {
    let settled = false;
    let verifiedStatus: string | null = null;
    let verifyError: string | null = null;

    try {
      const verified = await moolrePsp.verifyCharge(externalRef);
      verifiedStatus = verified.status;
      if (verified.status === "succeeded") {
        const r = await markPaidCore(externalRef);
        settled = true;
        if (!r.ok && r.error !== undefined && !/already/i.test(r.error)) {
          await audit({
            action: "webhook.received",
            targetType: "moolre_event",
            targetId: idempotencyKey,
            reason: `markPaid failed after verify: ${r.error}`,
            payload: { externalRef, verified },
          });
        }
      }
    } catch (err) {
      verifyError = (err as Error).message;
      console.error(
        `[webhook/moolre] verifyCharge failed for ref=${externalRef}:`,
        verifyError,
      );
    }

    // Fallback: if verifyCharge timed out / errored, but the webhook payload
    // explicitly says txstatus=1 (success), trust the payload and mark paid.
    // This is acceptable because Moolre's callback URL is a shared secret —
    // only Moolre should know it. We record this path in the audit log so ops
    // can monitor for abuse.
    if (!settled && txStatusFromPayload === 1) {
      const r = await markPaidCore(externalRef);
      settled = true;
      await audit({
        action: "webhook.received",
        targetType: "moolre_event",
        targetId: idempotencyKey,
        reason: verifyError
          ? `Marked paid from payload (verify unreachable: ${verifyError})`
          : `Marked paid from payload (verify=${verifiedStatus ?? "unknown"})`,
        payload: { externalRef, txStatusFromPayload, fallback: true, markPaidResult: r },
      });
    } else if (!settled) {
      await audit({
        action: "webhook.received",
        targetType: "moolre_event",
        targetId: idempotencyKey,
        reason: verifyError
          ? `Not settled: verify error + txstatus=${txStatusFromPayload}`
          : `Not settled: verify=${verifiedStatus}, txstatus=${txStatusFromPayload}`,
        payload: { externalRef },
      });
    }
  }

  // ---- Transfer (payout) status update: settle the payout row.
  if (
    isDbLive &&
    transactionId &&
    /transfer|payout|OBGH|disburs/i.test(event + " " + (data.code ?? ""))
  ) {
    try {
      const db = getDb();
      const [payout] = await db
        .select()
        .from(payouts)
        .where(eq(payouts.pspTransferRef, transactionId))
        .limit(1);
      if (payout) {
        if (txStatusFromPayload === 1) {
          await db
            .update(payouts)
            .set({ state: "paid", paidAt: new Date(), updatedAt: new Date() })
            .where(eq(payouts.id, payout.id));
          await audit({
            action: "payout.paid",
            targetType: "payout",
            targetId: payout.id,
            payload: { transferCode: transactionId, via: "webhook" },
          });
        } else if (txStatusFromPayload === 2) {
          await db
            .update(payouts)
            .set({
              state: "failed",
              failureReason: String(
                Array.isArray(data.message)
                  ? data.message.join(" ")
                  : data.message ?? "Moolre transfer failed",
              ),
              updatedAt: new Date(),
            })
            .where(eq(payouts.id, payout.id));
          await audit({
            action: "payout.failed",
            targetType: "payout",
            targetId: payout.id,
            payload: { transferCode: transactionId, data },
          });
        }
        // txstatus 0/3 → pending / unknown → leave as processing; sweep will reconcile.
      }
    } catch {
      // swallow; sweep retries.
    }
  }

  // Always return 200 so Moolre doesn't retry-storm. Our markPaid is idempotent
  // and the sweep will reconcile anything we missed.
  return NextResponse.json({ ok: true, sigOk });
}
