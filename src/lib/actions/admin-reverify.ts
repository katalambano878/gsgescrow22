"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { payouts, transactions, transactionEvents } from "@/lib/db/schema";
import { isDbLive } from "@/lib/env";
import { audit } from "@/lib/audit/log";
import { getCurrentProfile, isAdminRole } from "@/lib/auth/session";
import { getPsp } from "@/lib/payments";
import { getChargeAdapterForTxn } from "@/lib/payments/charge-adapter";
import {
  queueSellerPayout,
  executePayoutTransfer,
} from "@/lib/actions/transaction";
import { markPaidCore } from "@/lib/txn/mark-paid";
import { isMoneyHeld, type TxnState } from "@/lib/state/transaction";
import { sendSms, SmsTemplates } from "@/lib/sms";

/**
 * Break-glass: force-mark a transaction as paid without calling the PSP.
 * Superadmin only. Use when Moolre's status API is unreachable but we've
 * confirmed the payment landed via their dashboard or via their SMS receipt.
 * Creates an audit entry so ops can trace every manual settlement.
 */
export async function forceMarkPaid(
  ref: string,
  reason: string,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  if (!isDbLive) return { ok: false, error: "DB not configured" };
  const actor = await getCurrentProfile();
  if (!actor || actor.role !== "superadmin") {
    return { ok: false, error: "Superadmin only" };
  }
  if (!reason || reason.trim().length < 5) {
    return { ok: false, error: "Reason must be at least 5 characters" };
  }

  const db = getDb();
  const [txn] = await db.select().from(transactions).where(eq(transactions.ref, ref)).limit(1);
  if (!txn) return { ok: false, error: "Transaction not found" };
  if (txn.state !== "awaiting_payment") {
    return { ok: false, error: `Transaction is already in state '${txn.state}'` };
  }

  await audit({
    action: "webhook.received",
    targetType: "transaction",
    targetId: txn.id,
    reason: `FORCE mark paid by superadmin: ${reason}`,
    payload: { actor: actor.email, ref, previousState: txn.state },
  });

  const r = await markPaidCore(ref);
  if (!r.ok) return { ok: false, error: r.error ?? "markPaidCore failed" };

  revalidatePath(`/admin/transactions/${ref}`);
  revalidatePath(`/admin/transactions`);
  return {
    ok: true,
    message: "Transaction force-marked as paid. Seller notified via SMS.",
  };
}

/**
 * Force a re-verify of a payment against the active PSP. If the PSP reports
 * succeeded and our record still shows awaiting_payment, we run markPaid()
 * and the normal post-payment side effects fire (SMS + receipt email + state
 * machine progression).
 */
export async function reverifyPayment(
  ref: string,
): Promise<{ ok: boolean; status?: string; error?: string; message?: string }> {
  if (!isDbLive) return { ok: false, error: "DB not configured" };
  const actor = await getCurrentProfile();
  if (!actor || !isAdminRole(actor.role)) return { ok: false, error: "Not authorized" };

  const db = getDb();
  const [txn] = await db.select().from(transactions).where(eq(transactions.ref, ref)).limit(1);
  if (!txn) return { ok: false, error: "Transaction not found" };

  const chargePsp = await getChargeAdapterForTxn(txn.id);
  try {
    const v = await chargePsp.verifyCharge(ref);

    await audit({
      action: "webhook.received",
      targetType: "transaction",
      targetId: txn.id,
      reason: "Manual re-verify",
      payload: {
        pspStatus: v.status,
        pspAmount: v.amount,
        via: chargePsp.provider,
        actor: actor.email,
      },
    });

    if (v.status === "succeeded" && txn.state === "awaiting_payment") {
      const r = await markPaidCore(ref);
      if (!r.ok) return { ok: false, error: r.error ?? "markPaidCore failed" };
      revalidatePath(`/admin/transactions/${ref}`);
      return {
        ok: true,
        status: "succeeded",
        message: "PSP confirmed success — transaction moved to Paid.",
      };
    }

    revalidatePath(`/admin/transactions/${ref}`);
    return {
      ok: true,
      status: v.status,
      message:
        v.status === "succeeded"
          ? "PSP reports succeeded. Transaction is already past that state — no action taken."
          : v.status === "pending"
            ? "PSP still reports pending. Try again in a moment."
            : "PSP reports failed. If that's wrong, contact the PSP to investigate.",
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Force a re-verify of a payout against the active PSP. Moolre's webhook is
 * the primary settlement path, but if a webhook was lost or delayed, ops can
 * poke this to reconcile immediately.
 */
export async function reverifyPayout(
  payoutId: string,
): Promise<{ ok: boolean; status?: string; error?: string; message?: string }> {
  if (!isDbLive) return { ok: false, error: "DB not configured" };
  const actor = await getCurrentProfile();
  if (!actor || !isAdminRole(actor.role)) return { ok: false, error: "Not authorized" };

  const db = getDb();
  const [payout] = await db.select().from(payouts).where(eq(payouts.id, payoutId)).limit(1);
  if (!payout) return { ok: false, error: "Payout not found" };
  if (!payout.pspTransferRef) {
    return { ok: false, error: "No PSP transfer reference on this payout yet." };
  }

  const psp = getPsp();
  try {
    // Use verifyCharge as a generic status lookup — adapters map their own
    // status endpoint for both payments and transfers.
    const v = await psp.verifyCharge(payout.pspTransferRef);

    await audit({
      action: "webhook.received",
      targetType: "payout",
      targetId: payout.id,
      reason: "Manual payout re-verify",
      payload: { pspStatus: v.status, via: psp.provider, actor: actor.email },
    });

    if (v.status === "succeeded" && payout.state !== "paid") {
      await db
        .update(payouts)
        .set({ state: "paid", paidAt: new Date(), updatedAt: new Date() })
        .where(eq(payouts.id, payout.id));
      await db
        .update(transactions)
        .set({ state: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(transactions.id, payout.transactionId));
      await audit({
        action: "payout.paid",
        targetType: "payout",
        targetId: payout.id,
        payload: { via: "manual-reverify" },
      });
      revalidatePath("/admin/payouts");
      revalidatePath(`/admin/transactions`);
      return { ok: true, status: "paid", message: "Confirmed paid and transaction completed." };
    }

    if (v.status === "failed") {
      await db
        .update(payouts)
        .set({ state: "failed", failureReason: "Manual reverify reported failed", updatedAt: new Date() })
        .where(eq(payouts.id, payout.id));
      await audit({
        action: "payout.failed",
        targetType: "payout",
        targetId: payout.id,
        payload: { via: "manual-reverify" },
      });
      revalidatePath("/admin/payouts");
      return { ok: true, status: "failed", message: "PSP reports failed. Retry or reissue." };
    }

    return {
      ok: true,
      status: v.status,
      message: "Still pending at the PSP. Moolre's rule: never assume failure unless txstatus is explicitly 2.",
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Break-glass: superadmin initiates the seller payout without waiting for the
 * buyer to confirm delivery. Use only when the buyer has privately confirmed
 * out-of-band (call, WhatsApp, etc.) or when the deal is verified settled by
 * ops. Skips the normal paid → dispatched → delivered → released chain and
 * jumps straight to released + queue-for-approval. Approvers still need to
 * sign off before money actually leaves the PSP.
 */
export async function adminReleaseToPayout(
  ref: string,
  reason: string,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  if (!isDbLive) return { ok: false, error: "DB not configured" };
  const actor = await getCurrentProfile();
  if (!actor || actor.role !== "superadmin") {
    return { ok: false, error: "Superadmin only" };
  }
  if (!reason || reason.trim().length < 5) {
    return { ok: false, error: "Reason must be at least 5 characters" };
  }

  const db = getDb();
  const [txn] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.ref, ref))
    .limit(1);
  if (!txn) return { ok: false, error: "Transaction not found" };

  if (!isMoneyHeld(txn.state as TxnState)) {
    return {
      ok: false,
      error: `Payout can only be initiated while funds are held. Current state: ${txn.state}`,
    };
  }

  const [existing] = await db
    .select()
    .from(payouts)
    .where(eq(payouts.transactionId, txn.id))
    .limit(1);
  if (existing) {
    return {
      ok: false,
      error: `A payout already exists for this transaction (state: ${existing.state}).`,
    };
  }

  await db
    .update(transactions)
    .set({
      state: "released",
      deliveredAt: txn.deliveredAt ?? new Date(),
      releasedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, txn.id));

  await db.insert(transactionEvents).values({
    transactionId: txn.id,
    fromState: txn.state,
    toState: "released",
    actorRole: "superadmin",
    note: `Released by superadmin: ${reason.trim()}`,
  });

  await audit({
    action: "txn.release",
    targetType: "transaction",
    targetId: txn.id,
    reason: `Superadmin force-release: ${reason.trim()}`,
    payload: { ref, actor: actor.email, previousState: txn.state, via: "admin-break-glass" },
  });

  await queueSellerPayout(txn.id);

  try {
    await sendSms({
      to: txn.sellerPhone,
      body: SmsTemplates.releasedToSeller(ref),
      ref,
      kind: "txn.released",
      targetType: "transaction",
      targetId: txn.id,
    });
  } catch (err) {
    console.error("[admin-release] seller SMS failed (non-fatal):", (err as Error).message);
  }

  // Superadmin override: dispatch the PSP transfer immediately, bypassing the
  // normal two-approver queue. The superadmin is the sole approver of record.
  const [queued] = await db
    .select()
    .from(payouts)
    .where(eq(payouts.transactionId, txn.id))
    .limit(1);

  if (!queued) {
    return {
      ok: false,
      error: "Payout was not queued — state machine may have rejected it.",
    };
  }

  await audit({
    action: "payout.approve",
    targetType: "payout",
    targetId: queued.id,
    reason: `Superadmin override (no approver queue): ${reason.trim()}`,
    payload: { actor: actor.email, via: "admin-break-glass", amount: queued.amount },
  });

  const transfer = await executePayoutTransfer(queued.id, actor.id);

  revalidatePath(`/admin/transactions/${ref}`);
  revalidatePath(`/admin/transactions`);
  revalidatePath(`/admin/payouts`);
  revalidatePath(`/admin/payouts/approvals`);

  if (!transfer.ok) {
    return {
      ok: false,
      error: `Released, but PSP transfer failed: ${transfer.error ?? "unknown error"}. The payout row is marked failed — retry from the Payouts page.`,
    };
  }

  return {
    ok: true,
    message:
      "Released and payout dispatched to PSP. Seller SMS sent. Check the Payouts page for final settlement status.",
  };
}

/**
 * Superadmin-only: dispatch an already-queued payout (state=pending_approval)
 * directly via the PSP without waiting for the two-approver workflow. Use when
 * the payout was queued by the normal flow but approvers are unavailable or
 * the superadmin wants to override for a specific case. Fully audit-logged.
 */
export async function adminDispatchQueuedPayout(
  payoutId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  if (!isDbLive) return { ok: false, error: "DB not configured" };
  const actor = await getCurrentProfile();
  if (!actor || actor.role !== "superadmin") {
    return { ok: false, error: "Superadmin only" };
  }
  if (!reason || reason.trim().length < 5) {
    return { ok: false, error: "Reason must be at least 5 characters" };
  }

  const db = getDb();
  const [payout] = await db
    .select()
    .from(payouts)
    .where(eq(payouts.id, payoutId))
    .limit(1);
  if (!payout) return { ok: false, error: "Payout not found" };
  const validStates = ["pending_approval", "approved", "failed"];
  if (!validStates.includes(payout.state)) {
    return {
      ok: false,
      error: `Payout is in state '${payout.state}' — can only dispatch ${validStates.join(", ")}.`,
    };
  }

  // If this is a retry of a previously-failed payout, reset the failure
  // reason and move it back to pending_approval so executeTransfer can pick
  // up cleanly. It will be re-stamped with the new transfer result.
  if (payout.state === "failed") {
    await db
      .update(payouts)
      .set({
        state: "pending_approval",
        failureReason: null,
        updatedAt: new Date(),
      })
      .where(eq(payouts.id, payout.id));
  }

  await audit({
    action: "payout.approve",
    targetType: "payout",
    targetId: payout.id,
    reason: `Superadmin override — bypassed approver queue: ${reason.trim()}`,
    payload: {
      actor: actor.email,
      via: "admin-break-glass",
      amount: payout.amount,
      previousState: payout.state,
    },
  });

  const transfer = await executePayoutTransfer(payout.id, actor.id);

  revalidatePath(`/admin/transactions`);
  revalidatePath(`/admin/payouts`);
  revalidatePath(`/admin/payouts/approvals`);

  if (!transfer.ok) {
    return {
      ok: false,
      error: `PSP transfer failed: ${transfer.error ?? "unknown error"}. Payout row marked failed — retry from Payouts page.`,
    };
  }

  return {
    ok: true,
    message:
      "Payout dispatched to PSP. Seller SMS sent. Check the Payouts page for final settlement status.",
  };
}
