import { and, count, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { alerts, disputes, payouts, profiles, transactions } from "@/lib/db/schema";
import { getSettings } from "@/lib/settings";
import { formatGhs } from "@/lib/utils";
import { isDbLive } from "@/lib/env";
import { sendOpsAlert } from "@/lib/sms";

export interface RiskFlag {
  code:
    | "high_value"
    | "new_seller_large_payout"
    | "velocity"
    | "mismatched_momo"
    | "repeat_disputes"
    | "seller_suspended"
    | "kyc_missing";
  severity: "info" | "warning" | "critical";
  message: string;
  block?: boolean;
}

/**
 * Evaluate a seller payout against every fraud rule and return flags.
 * A rule can mark `block: true` to require additional approval (not auto-reject).
 */
export async function evaluateSellerPayoutRisk(input: {
  transactionId: string;
  amount: number;
  sellerId: string | null;
  sellerPhone: string;
}): Promise<RiskFlag[]> {
  if (!isDbLive) return [];
  const cfg = await getSettings();
  const flags: RiskFlag[] = [];
  const db = getDb();

  if (input.amount >= cfg.high_value_alert_pesewas) {
    flags.push({
      code: "high_value",
      severity: "warning",
      message: `Payout of ${formatGhs(input.amount)} crosses the high-value threshold (${formatGhs(cfg.high_value_alert_pesewas)}).`,
    });
  }

  if (input.sellerId) {
    const [seller] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, input.sellerId))
      .limit(1);

    if (seller?.suspended) {
      flags.push({
        code: "seller_suspended",
        severity: "critical",
        message: "Seller account is suspended. Payout must not proceed.",
        block: true,
      });
    }

    if (seller && seller.kycStatus !== "approved" && input.amount >= cfg.new_seller_max_payout_pesewas) {
      flags.push({
        code: "kyc_missing",
        severity: "critical",
        message: "Seller hasn't completed KYC and payout exceeds the new-seller cap.",
        block: true,
      });
    }

    if (seller) {
      const ageDays = Math.floor(
        (Date.now() - seller.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (ageDays < cfg.new_seller_days_threshold && input.amount >= cfg.new_seller_max_payout_pesewas) {
        flags.push({
          code: "new_seller_large_payout",
          severity: "warning",
          message: `Seller is ${ageDays} day${ageDays === 1 ? "" : "s"} old and payout is ${formatGhs(input.amount)}.`,
        });
      }
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [velocity] = await db
      .select({ n: count() })
      .from(payouts)
      .where(
        and(
          eq(payouts.payeeId, input.sellerId),
          gte(payouts.createdAt, since),
        ),
      );
    if (velocity && velocity.n >= 5) {
      flags.push({
        code: "velocity",
        severity: "warning",
        message: `${velocity.n} payouts queued for this seller in the last 24 hours.`,
      });
    }

    const disputeSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [openDisp] = await db
      .select({ n: count() })
      .from(disputes)
      .innerJoin(transactions, eq(disputes.transactionId, transactions.id))
      .where(
        and(
          eq(transactions.sellerId, input.sellerId),
          gte(disputes.createdAt, disputeSince),
        ),
      );
    if (openDisp && openDisp.n >= 3) {
      flags.push({
        code: "repeat_disputes",
        severity: "critical",
        message: `Seller has ${openDisp.n} disputes in the last 30 days.`,
        block: true,
      });
    }
  }

  const normalized = normalizeMomo(input.sellerPhone);
  if (input.sellerId && normalized) {
    const recent = await db
      .select({ phone: payouts.payeePhone })
      .from(payouts)
      .where(eq(payouts.payeeId, input.sellerId))
      .orderBy(desc(payouts.createdAt))
      .limit(3);
    const priorPhones = new Set(recent.map((r) => normalizeMomo(r.phone)).filter(Boolean));
    if (priorPhones.size > 0 && !priorPhones.has(normalized)) {
      flags.push({
        code: "mismatched_momo",
        severity: "warning",
        message: `Payout MoMo number changed from prior deals (${[...priorPhones].join(", ")}).`,
      });
    }
  }

  return flags;
}

function normalizeMomo(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("233") && d.length === 12) return `+${d}`;
  if (d.startsWith("0") && d.length === 10) return `+233${d.slice(1)}`;
  if (d.length === 9) return `+233${d}`;
  return `+${d}`;
}

/**
 * Persist fraud flags as alerts so the ops team sees them on the dashboard.
 */
export async function recordFlags(
  flags: RiskFlag[],
  target: { type: "payout" | "transaction"; id: string; ref: string },
): Promise<void> {
  if (!isDbLive || flags.length === 0) return;
  const db = getDb();
  for (const f of flags) {
    await db.insert(alerts).values({
      kind: `rule.${f.code}`,
      severity: f.severity,
      title: f.message,
      message: `Target ${target.type}:${target.ref}`,
      targetType: target.type,
      targetId: target.id,
      payload: { ...f, ref: target.ref } as unknown as Record<string, unknown>,
    });
  }

  const critical = flags.filter((f) => f.severity === "critical");
  if (critical.length > 0) {
    await sendOpsAlert(
      `${target.type === "payout" ? "Payout" : "Transaction"} flagged: ${target.ref}`,
      critical.map((f) => `${f.code}: ${f.message}`).join(" · "),
      { kind: "fraud.critical", targetId: target.id },
    );
  }
}
