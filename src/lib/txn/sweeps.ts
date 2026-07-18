/**
 * Cron-only transaction sweeps. Not Server Actions — never import from client.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { transactions, transactionEvents, payouts } from "@/lib/db/schema";
import { audit } from "@/lib/audit/log";
import { sendSms, SmsTemplates } from "@/lib/sms";
import { markPaidCore } from "@/lib/txn/mark-paid";
import { getChargeAdapterForTxn } from "@/lib/payments/charge-adapter";
import { queueSellerPayout } from "@/lib/actions/transaction";

export async function autoReleaseSweep(): Promise<{ released: number }> {
  const db = getDb();
  const now = new Date();
  const candidates = await db
    .select()
    .from(transactions);
  let count = 0;
  for (const t of candidates) {
    if (
      t.state === "dispatched" &&
      t.autoReleaseAt &&
      t.autoReleaseAt <= now
    ) {
      try {
        await db
          .update(transactions)
          .set({
            state: "released",
            deliveredAt: t.deliveredAt ?? now,
            releasedAt: now,
            updatedAt: now,
          })
          .where(eq(transactions.id, t.id));
        await db.insert(transactionEvents).values({
          transactionId: t.id,
          fromState: "dispatched",
          toState: "released",
          note: "Auto-released after timer",
        });
        await audit({
          action: "txn.auto_release",
          targetType: "transaction",
          targetId: t.id,
          payload: { ref: t.ref },
        });
        await queueSellerPayout(t.id);
        await sendSms({
          to: t.sellerPhone,
          body: SmsTemplates.autoReleasedSeller(t.ref),
          ref: t.ref,
          kind: "txn.auto_release",
          targetType: "transaction",
          targetId: t.id,
        });
        count += 1;
      } catch {
        // continue
      }
    }
  }
  return { released: count };
}


/**
 * Reconciliation sweep — for every transaction in awaiting_payment,
 * ask the charge PSP what it thinks and converge. Run hourly via cron.
 */
export async function reconcileSweep(): Promise<{
  paymentsReconciled: number;
  payoutsReconciled: number;
}> {
  const db = getDb();
  let paymentsReconciled = 0;
  let payoutsReconciled = 0;

  const pendingTxns = await db
    .select()
    .from(transactions)
    .where(eq(transactions.state, "awaiting_payment"));

  for (const t of pendingTxns) {
    try {
      const chargePsp = await getChargeAdapterForTxn(t.id);
      const v = await chargePsp.verifyCharge(t.ref);
      if (v.status === "succeeded") {
        await markPaidCore(t.ref);
        paymentsReconciled += 1;
      }
    } catch {
      // continue
    }
  }

  const stuckPayouts = await db
    .select()
    .from(payouts)
    .where(eq(payouts.state, "paid"));
  for (const p of stuckPayouts) {
    try {
      const [txn] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, p.transactionId))
        .limit(1);
      if (txn && txn.state !== "completed") {
        await db
          .update(transactions)
          .set({ state: "completed", completedAt: new Date(), updatedAt: new Date() })
          .where(eq(transactions.id, p.transactionId));
        payoutsReconciled += 1;
      }
    } catch {
      // continue
    }
  }

  return { paymentsReconciled, payoutsReconciled };
}
