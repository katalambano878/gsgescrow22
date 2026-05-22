import { eq } from "drizzle-orm";
import { isDbLive, isHubtelSmsLive, isMoolreSmsLive } from "../env";
import { getDb } from "../db/client";
import { smsLog } from "../db/schema";
import { hubtelSms } from "./hubtel";
import { moolreSms } from "./moolre";
import { env } from "../env";
import type { SmsAdapter, SmsBatchResult, SmsMessage, SmsResult } from "./types";

export type { SmsAdapter, SmsMessage, SmsResult, SmsBatchResult };

const stubSms: SmsAdapter = {
  provider: "stub",
  async send(msg: SmsMessage): Promise<SmsResult> {
    console.log(`[sms:stub] -> ${msg.to}: ${msg.body}`);
    return { ok: true, providerMessageId: `stub_${Date.now()}`, provider: "stub" };
  },
  async sendBatch(msgs: SmsMessage[]): Promise<SmsBatchResult> {
    return {
      ok: true,
      provider: "stub",
      results: msgs.map((m, i) => ({
        ok: true,
        providerMessageId: `stub_${Date.now()}_${i}`,
        provider: "stub",
      })),
    };
  },
};

function pickAdapter(): SmsAdapter {
  if (isMoolreSmsLive) return moolreSms;
  if (isHubtelSmsLive) return hubtelSms;
  return stubSms;
}

export function getSms(): SmsAdapter {
  return pickAdapter();
}

async function logSms(
  msg: SmsMessage,
  result: SmsResult,
  provider: string,
): Promise<void> {
  if (!isDbLive) return;
  try {
    await getDb().insert(smsLog).values({
      provider,
      senderId: env.MOOLRE_SMS_SENDER_ID,
      recipient: msg.to,
      body: msg.body,
      kind: msg.kind ?? null,
      ref: msg.ref ?? null,
      providerMessageId: result.providerMessageId ?? null,
      status: result.ok ? "sent" : "failed",
      error: result.error ?? null,
      targetType: msg.targetType ?? null,
      targetId: msg.targetId ?? null,
      sentAt: result.ok ? new Date() : null,
    });
  } catch {
    // Never let logging break the send path.
  }
}

/**
 * Primary send entry point. Writes to sms_log win or lose, retries on the
 * failover adapter if Moolre rejects with an auth/sender-ID error, and
 * swallows throws so a bad recipient can never block a server action.
 */
export async function sendSms(msg: SmsMessage): Promise<SmsResult> {
  if (!msg.to || msg.to.trim().length < 7) {
    await logSms(msg, { ok: false, error: "Invalid recipient" }, "none");
    return { ok: false, error: "Invalid recipient" };
  }
  const primary = pickAdapter();
  let result = await primary.send(msg);
  await logSms(msg, result, primary.provider);

  // Failover: if Moolre's unhappy and Hubtel is configured, try Hubtel once.
  if (!result.ok && primary.provider === "moolre" && isHubtelSmsLive) {
    const alt = await hubtelSms.send(msg);
    await logSms(msg, alt, "hubtel-failover");
    if (alt.ok) result = alt;
  }
  return result;
}

/**
 * Fan-out a single message to multiple recipients. Uses the adapter's batch
 * endpoint when available (Moolre supports it natively), otherwise falls
 * back to parallel sends. Every recipient still gets its own sms_log row.
 */
export async function sendSmsBatch(
  recipients: string[],
  body: string,
  opts: { kind?: string; ref?: string; targetType?: string; targetId?: string } = {},
): Promise<SmsBatchResult> {
  const msgs: SmsMessage[] = recipients
    .filter((r) => r && r.trim().length >= 7)
    .map((to) => ({ to, body, ...opts }));
  if (msgs.length === 0) return { ok: true, results: [] };

  const primary = pickAdapter();
  if (typeof primary.sendBatch === "function") {
    const res = await primary.sendBatch(msgs);
    await Promise.all(msgs.map((m, i) => logSms(m, res.results[i], primary.provider)));
    return res;
  }

  // Fallback: serial sends with individual logging.
  const results: SmsResult[] = [];
  for (const m of msgs) {
    const r = await sendSms(m);
    results.push(r);
  }
  return { ok: results.every((r) => r.ok), results };
}

/**
 * Ping the ops alert phones (OPS_ALERT_PHONES). Used for fraud spikes,
 * webhook signature failures, high-value payouts, name mismatches.
 */
export async function sendOpsAlert(
  title: string,
  detail?: string,
  opts: { kind?: string; targetId?: string } = {},
): Promise<void> {
  const phones = (env.OPS_ALERT_PHONES ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (phones.length === 0) return;
  const body = detail ? `SBBS ALERT · ${title}\n${detail}` : `SBBS ALERT · ${title}`;
  await sendSmsBatch(phones, body, {
    kind: opts.kind ?? "ops.alert",
    targetType: "ops_alert",
    targetId: opts.targetId,
  });
}

/**
 * Mark an SMS as delivered based on an inbound provider webhook. Safe no-op
 * if we never recorded the underlying send.
 */
export async function markSmsDelivered(providerMessageId: string): Promise<void> {
  if (!isDbLive || !providerMessageId) return;
  try {
    await getDb()
      .update(smsLog)
      .set({ status: "delivered" })
      .where(eq(smsLog.providerMessageId, providerMessageId));
  } catch {
    // ignore
  }
}

/**
 * Full SMS template catalog. Every template takes the minimum fields, keeps
 * length under 160 chars where practical, and always ends with a short sbbs.gh
 * deep-link so the recipient can act.
 */
export const SmsTemplates = {
  // ---- Transactions ---------------------------------------------------
  orderCreatedSeller: (sellerFirst: string, ref: string, amount: string, link: string) =>
    `${sellerFirst}, a buyer on SBBS has started a protected order for ${amount}. Reference ${ref}. We'll SMS you the moment they pay. ${link}`,
  /**
   * Sent to a seller who does NOT yet have an SBBS account. The link goes
   * to the signup page with a signed claim token so their new account
   * automatically inherits this (and any other pending) order.
   */
  orderCreatedSellerClaim: (sellerFirst: string, ref: string, amount: string, buyerName: string, signupLink: string) =>
    `${sellerFirst || "Hi"}, ${buyerName} wants to buy from you safely on SBBS (${amount}, ref ${ref}). Create your free account to fulfil the order and get paid: ${signupLink}`,
  orderCreatedBuyer: (buyerFirst: string, ref: string, amount: string, link: string) =>
    `${buyerFirst}, your SBBS order ${ref} is ready for payment (${amount}). Pay here to protect it: ${link}`,
  paymentReceived: (sellerFirst: string, ref: string, amount: string) =>
    `${sellerFirst}, payment of ${amount} for order ${ref} is held safely by SBBS. You may now dispatch. sbbs.gh/hub`,
  paymentHeldBuyer: (buyerFirst: string, ref: string, amount: string) =>
    `${buyerFirst}, your ${amount} for ${ref} is held safely. The seller is notified. We'll SMS your delivery code on dispatch.`,
  dispatchedToBuyer: (ref: string, code: string) =>
    `Your SBBS order ${ref} has been dispatched. Your delivery code is ${code} — give it to the rider ONLY after inspecting your item. sbbs.gh/hub`,
  dispatchedToSeller: (ref: string) =>
    `Dispatch marked for ${ref}. We've sent the delivery code to the buyer. When they release it, your payout enters our approval queue.`,
  deliveredToBuyer: (ref: string) =>
    `Your SBBS order ${ref} has been marked DELIVERED by the seller. Inspect, then confirm in your Hub to release the payout. sbbs.gh/hub`,
  releasedToSeller: (ref: string) =>
    `Order ${ref} confirmed. SBBS payout is queued for approval. You'll be notified again when funds hit your MoMo.`,
  autoReleasedSeller: (ref: string) =>
    `72h auto-release fired on order ${ref}. Payout is queued for approval. Funds will hit your MoMo once approved.`,
  cancelledBuyer: (ref: string, reason: string) =>
    `Order ${ref} was cancelled: ${reason}. If you already paid, a refund will reach your original payment method within 3 business days.`,
  cancelledSeller: (ref: string, reason: string) =>
    `Order ${ref} was cancelled: ${reason}. No payout will be issued for this deal. sbbs.gh/hub`,
  // ---- Payouts --------------------------------------------------------
  payoutSent: (ref: string, amount: string) =>
    `SBBS payout of ${amount} for order ${ref} has been sent to your MoMo. Thank you for selling safely.`,
  payoutFailed: (ref: string, amount: string, reason: string) =>
    `Payout of ${amount} for ${ref} failed: ${reason}. Our team is investigating — you don't need to take action.`,
  payoutRejected: (ref: string, reason: string) =>
    `Your payout for ${ref} was rejected: ${reason}. Contact support at sbbs.gh/contact.`,
  payoutTwoApproverWaiting: (ref: string, amount: string) =>
    `Your ${amount} payout for ${ref} has first approval and is waiting on a second SBBS approver. This is routine for high-value payouts.`,
  // ---- Disputes -------------------------------------------------------
  disputeOpened: (ref: string) =>
    `A dispute has been opened on order ${ref}. The transaction is on hold pending review. sbbs.gh/hub`,
  disputeResolvedBuyer: (ref: string, outcome: string) =>
    `Your dispute on ${ref} has been decided: ${outcome}. Full details in your Hub. sbbs.gh/hub`,
  disputeResolvedSeller: (ref: string, outcome: string) =>
    `The dispute on ${ref} has been decided: ${outcome}. Full details in your Hub. sbbs.gh/hub`,
  refundIssued: (ref: string, amount: string) =>
    `A refund of ${amount} for order ${ref} has been issued and will reach your original payment method shortly.`,
  // ---- KYC ------------------------------------------------------------
  kycSubmitted: () =>
    `Your SBBS KYC documents have been received. Review usually takes 1-2 business days. We'll SMS you as soon as it's decided.`,
  kycApproved: () =>
    `Your SBBS KYC is APPROVED. Your Trust Badge is live and the full payout cap is unlocked. Paste your badge in your Instagram bio at sbbs.gh/badge`,
  kycRejected: (reason: string) =>
    `Your SBBS KYC needs more info: ${reason}. Update your documents at sbbs.gh/hub/profile and we'll re-review.`,
  // ---- Listings -------------------------------------------------------
  listingApproved: (title: string) =>
    `Your SBBS listing "${title}" is live in the marketplace. sbbs.gh/hub/listings`,
  listingSuspended: (title: string, reason: string) =>
    `Your SBBS listing "${title}" was suspended: ${reason}. Contact support at sbbs.gh/contact.`,
  listingSold: (title: string, ref: string) =>
    `Your listing "${title}" just sold via SBBS. Order ${ref} is being held safely — we'll notify you to dispatch.`,
  // ---- Reviews --------------------------------------------------------
  reviewReceived: (stars: number, from: string) =>
    `New ${stars}-star review from ${from} on SBBS. See it on your public profile. sbbs.gh/hub`,
  // ---- Account --------------------------------------------------------
  welcome: (firstName: string) =>
    `Welcome to SBBS ${firstName}. Your Hub is live — any protected deal you do will appear there. sbbs.gh/hub`,
  loginOtp: (code: string) =>
    `Your SBBS sign-in code is ${code}. Do not share it. Expires in 10 minutes.`,
  suspendedAccount: (reason: string) =>
    `Your SBBS account has been suspended: ${reason}. Appeal at sbbs.gh/contact.`,
  roleChanged: (role: string) =>
    `Your SBBS account role is now "${role}". Open sbbs.gh/hub for the new capabilities.`,
} as const;
