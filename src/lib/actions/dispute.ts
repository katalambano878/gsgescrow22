"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  transactions,
  transactionEvents,
  disputes,
  evidenceFiles,
  payments,
} from "@/lib/db/schema";
import { isDbLive } from "@/lib/env";
import { audit } from "@/lib/audit/log";
import { assertTransition, type TxnState } from "@/lib/state/transaction";
import { getCurrentProfile, isAdminRole } from "@/lib/auth/session";
import { sendSms, SmsTemplates } from "@/lib/sms";
import { formatGhs } from "@/lib/utils";
import { chargeAdapterForProvider } from "@/lib/payments/charge-adapter";

const openSchema = z.object({
  ref: z.string(),
  role: z.enum(["buyer", "seller", "guest"]),
  reason: z.string().min(2),
  description: z.string().optional(),
});

export async function openDispute(input: z.infer<typeof openSchema>) {
  if (!isDbLive) return { ok: false, error: "DB not configured" };
  const parsed = openSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const db = getDb();
  const [txn] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.ref, parsed.data.ref))
    .limit(1);
  if (!txn) return { ok: false, error: "Transaction not found" };
  if (parsed.data.role === "guest") return { ok: false, error: "Sign in to open a dispute" };

  const profile = await getCurrentProfile().catch(() => null);
  if (!profile) return { ok: false, error: "Sign in to open a dispute" };
  const isBuyer = profile.id === txn.buyerId;
  const isSeller = profile.id === txn.sellerId;
  if (!isBuyer && !isSeller && !isAdminRole(profile.role)) {
    return { ok: false, error: "Only the buyer or seller on this deal can open a dispute." };
  }
  // Don't trust the client-supplied role — derive it from the session.
  const openerRole: "buyer" | "seller" =
    isAdminRole(profile.role)
      ? parsed.data.role === "seller"
        ? "seller"
        : "buyer"
      : isSeller
        ? "seller"
        : "buyer";

  try {
    assertTransition(txn.state as TxnState, "disputed");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  await db
    .update(transactions)
    .set({ state: "disputed", updatedAt: new Date() })
    .where(eq(transactions.id, txn.id));
  await db.insert(disputes).values({
    transactionId: txn.id,
    openedBy: profile.id,
    openerRole,
    reason: parsed.data.reason,
    description: parsed.data.description ?? null,
    state: "open",
    slaDueAt: new Date(Date.now() + 5 * 24 * 3_600_000),
  });
  await db.insert(transactionEvents).values({
    transactionId: txn.id,
    fromState: txn.state,
    toState: "disputed",
    actorId: profile.id,
    actorRole: openerRole,
    note: `Dispute opened: ${parsed.data.reason}`,
  });
  await audit({
    action: "txn.dispute_open",
    targetType: "transaction",
    targetId: txn.id,
    reason: parsed.data.reason,
  });

  await sendSms({
    to: txn.buyerPhone,
    body: SmsTemplates.disputeOpened(txn.ref),
    ref: txn.ref,
    kind: "dispute.opened",
    targetType: "transaction",
    targetId: txn.id,
  });
  await sendSms({
    to: txn.sellerPhone,
    body: SmsTemplates.disputeOpened(txn.ref),
    ref: txn.ref,
    kind: "dispute.opened",
    targetType: "transaction",
    targetId: txn.id,
  });

  revalidatePath(`/hub/transactions/${txn.ref}`);
  return { ok: true };
}

const resolveSchema = z.object({
  disputeId: z.string().uuid(),
  resolution: z.enum(["resolved_buyer", "resolved_seller", "partial"]),
  refundAmount: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
});

export async function resolveDispute(input: z.infer<typeof resolveSchema>) {
  if (!isDbLive) return { ok: false, error: "DB not configured" };
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const profile = await getCurrentProfile().catch(() => null);
  if (!profile || !isAdminRole(profile.role)) {
    return { ok: false, error: "Only an admin can resolve disputes" };
  }
  const db = getDb();
  const [d] = await db.select().from(disputes).where(eq(disputes.id, parsed.data.disputeId)).limit(1);
  if (!d) return { ok: false, error: "Dispute not found" };
  const [txn] = await db.select().from(transactions).where(eq(transactions.id, d.transactionId)).limit(1);
  if (!txn) return { ok: false, error: "Transaction not found" };

  let nextTxnState: TxnState = "released";
  if (parsed.data.resolution === "resolved_buyer") nextTxnState = "refund_issued";
  else if (parsed.data.resolution === "partial") nextTxnState = "partial_refund";

  await db
    .update(disputes)
    .set({
      state: parsed.data.resolution,
      resolution: parsed.data.notes ?? null,
      refundAmount: parsed.data.refundAmount ?? null,
      resolvedBy: profile?.id ?? null,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(disputes.id, d.id));

  await db
    .update(transactions)
    .set({ state: nextTxnState, updatedAt: new Date() })
    .where(eq(transactions.id, txn.id));

  await db.insert(transactionEvents).values({
    transactionId: txn.id,
    fromState: "disputed",
    toState: nextTxnState,
    actorId: profile?.id ?? null,
    actorRole: profile?.role ?? "admin",
    note: `Resolved: ${parsed.data.resolution}`,
  });

  await audit({
    action: "txn.dispute_resolve",
    targetType: "dispute",
    targetId: d.id,
    payload: { resolution: parsed.data.resolution, refundAmount: parsed.data.refundAmount ?? 0 },
  });

  const outcomeText =
    parsed.data.resolution === "resolved_buyer"
      ? "Refund to buyer"
      : parsed.data.resolution === "resolved_seller"
        ? "Released to seller"
        : "Partial refund";
  await sendSms({
    to: txn.buyerPhone,
    body: SmsTemplates.disputeResolvedBuyer(txn.ref, outcomeText),
    ref: txn.ref,
    kind: "dispute.resolved",
    targetType: "transaction",
    targetId: txn.id,
  });
  await sendSms({
    to: txn.sellerPhone,
    body: SmsTemplates.disputeResolvedSeller(txn.ref, outcomeText),
    ref: txn.ref,
    kind: "dispute.resolved",
    targetType: "transaction",
    targetId: txn.id,
  });

  if (parsed.data.resolution === "resolved_buyer" || parsed.data.resolution === "partial") {
    const refundAmount = parsed.data.refundAmount ?? txn.totalCharged;
    try {
      const [paid] = await db
        .select()
        .from(payments)
        .where(and(eq(payments.transactionId, txn.id), eq(payments.state, "succeeded")))
        .orderBy(desc(payments.createdAt))
        .limit(1);
      const psp = chargeAdapterForProvider(paid?.psp);
      await psp.refund({
        paymentReference: paid?.pspReference ?? txn.ref,
        amount: refundAmount,
        reason: `Dispute resolution: ${d.id}`,
        buyerPhone: txn.buyerPhone,
        buyerNetwork:
          (txn.metadata as { buyerNetwork?: string } | null)?.buyerNetwork ?? "MTN",
        buyerName: txn.buyerName,
      });
      await audit({
        action: "refund.issue",
        targetType: "transaction",
        targetId: txn.id,
        payload: { amount: refundAmount, via: psp.provider },
      });
      await sendSms({
        to: txn.buyerPhone,
        body: SmsTemplates.refundIssued(txn.ref, formatGhs(refundAmount)),
        ref: txn.ref,
        kind: "refund.issued",
        targetType: "transaction",
        targetId: txn.id,
      });
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  revalidatePath("/admin/disputes");
  return { ok: true };
}

export async function attachEvidence(
  disputeId: string,
  storagePath: string,
  mime: string,
  sizeBytes: number,
  caption?: string,
) {
  if (!isDbLive) return { ok: false, error: "DB not configured" };
  const profile = await getCurrentProfile().catch(() => null);
  if (!profile) return { ok: false, error: "Sign in first" };

  const db = getDb();
  const [d] = await db.select().from(disputes).where(eq(disputes.id, disputeId)).limit(1);
  if (!d) return { ok: false, error: "Dispute not found" };
  const [txn] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, d.transactionId))
    .limit(1);
  if (!txn) return { ok: false, error: "Transaction not found" };
  const isParty = profile.id === txn.buyerId || profile.id === txn.sellerId;
  if (!isParty && !isAdminRole(profile.role)) {
    return { ok: false, error: "Only a party to this dispute can attach evidence" };
  }
  if (sizeBytes <= 0 || sizeBytes > 20 * 1024 * 1024) {
    return { ok: false, error: "Evidence file must be between 1 byte and 20MB" };
  }

  await db.insert(evidenceFiles).values({
    disputeId,
    uploaderId: profile.id,
    storagePath,
    mime,
    sizeBytes,
    caption: caption ?? null,
  });
  await audit({
    action: "txn.dispute_open",
    targetType: "evidence_file",
    targetId: disputeId,
    payload: { storagePath, mime, sizeBytes },
  });
  return { ok: true };
}
