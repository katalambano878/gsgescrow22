/**
 * Trusted-source payment capture. NOT a Server Action — only import from
 * webhooks, return page, admin reverify, and cron sweeps. Client-facing
 * markPaid in actions/transaction.ts requires an admin session.
 */
import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { transactions, payments, transactionEvents } from "@/lib/db/schema";
import { audit } from "@/lib/audit/log";
import { formatGhs, generateDeliveryCode } from "@/lib/utils";
import { assertTransition, type TxnState } from "@/lib/state/transaction";
import { sendSms, SmsTemplates } from "@/lib/sms";
import { paymentReceivedEmail, sendEmail } from "@/lib/email";
import { idempotent } from "@/lib/idempotency";

export async function markPaidCore(ref: string): Promise<{ ok: boolean; error?: string }> {
  return idempotent(`txn:paid:${ref}`, async () => {
    const db = getDb();
    const [txn] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.ref, ref))
      .limit(1);
    if (!txn) return { ok: false, error: "Transaction not found" };
    if (txn.state !== "awaiting_payment") return { ok: true };

    try {
      assertTransition(txn.state as TxnState, "paid");
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }

    const code = generateDeliveryCode();
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");

    await db
      .update(transactions)
      .set({
        state: "paid",
        paidAt: new Date(),
        deliveryCodeHash: codeHash,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, txn.id));

    await db
      .update(payments)
      .set({ state: "succeeded", updatedAt: new Date() })
      .where(
        and(
          eq(payments.transactionId, txn.id),
          inArray(payments.state, ["initialized", "pending"]),
        ),
      );

    await db.insert(transactionEvents).values({
      transactionId: txn.id,
      fromState: txn.state,
      toState: "paid",
      note: "Payment captured by PSP",
    });

    await audit({
      action: "txn.pay",
      targetType: "transaction",
      targetId: txn.id,
      payload: { ref, totalCharged: txn.totalCharged },
    });

    await sendSms({
      to: txn.sellerPhone,
      body: SmsTemplates.paymentReceived(
        txn.sellerName.split(" ")[0],
        ref,
        formatGhs(txn.totalCharged),
      ),
      ref,
      kind: "txn.paid",
      targetType: "transaction",
      targetId: txn.id,
    });
    await sendSms({
      to: txn.buyerPhone,
      body: SmsTemplates.paymentHeldBuyer(
        txn.buyerName.split(" ")[0],
        ref,
        formatGhs(txn.totalCharged),
      ),
      ref,
      kind: "txn.paid",
      targetType: "transaction",
      targetId: txn.id,
    });

    const buyerEmail = (txn.metadata as { buyerEmail?: string } | null)?.buyerEmail;
    if (buyerEmail) {
      await sendEmail({
        to: buyerEmail,
        subject: `Payment held safely · ${ref}`,
        html: paymentReceivedEmail({
          ref,
          sellerName: txn.sellerName,
          itemDescription: txn.itemDescription,
          totalCharged: txn.totalCharged,
        }),
        tags: [{ name: "event", value: "txn.paid" }, { name: "ref", value: ref }],
      });
    }

    return { ok: true };
  });
}

