import Link from "next/link";
import {
  Receipt,
  CreditCard,
  Truck,
  PackageCheck,
  HandCoins,
  Wallet,
  CheckCircle2,
  AlertTriangle,
  Ban,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatGhs, relativeTime } from "@/lib/utils";
import type { TxnState } from "@/lib/state/transaction";
import { TxnProgressTickButton } from "./txn-progress-actions";

type PayoutSummary = {
  kind: "rider" | "seller";
  state: string;
  paidAt: Date | null;
  amount: number;
};

export function TxnProgress({
  txnRef,
  state,
  orderType,
  role,
  createdAt,
  paidAt,
  dispatchedAt,
  deliveredAt,
  releasedAt,
  completedAt,
  cancelledAt,
  riderPayoutAmount,
  sellerPayoutAmount,
  payouts,
}: {
  txnRef: string;
  state: TxnState;
  orderType: "product" | "service";
  role: "buyer" | "seller" | "guest";
  createdAt: Date;
  paidAt: Date | null;
  dispatchedAt: Date | null;
  deliveredAt: Date | null;
  releasedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  riderPayoutAmount: number;
  sellerPayoutAmount: number;
  payouts: PayoutSummary[];
}) {
  const isService = orderType === "service";
  const isCancelled = state === "cancelled";
  const isDisputed = state === "disputed";

  const riderPayout = payouts.find((p) => p.kind === "rider");
  const sellerPayout = payouts.find((p) => p.kind === "seller");

  // Order matters: progress flows top-to-bottom (vertical on mobile, snake
  // horizontally on desktop). We compute `done` from real timestamps + state
  // so that re-renders after server actions show updated ticks immediately.
  type Step = {
    key: string;
    title: string;
    description: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    done: boolean;
    timestamp: Date | null;
    /** Inline tick action shown only to the right party at the right moment. */
    action?: {
      label: string;
      role: "buyer" | "seller";
      kind: "pay" | "dispatch" | "deliver" | "release";
    };
    skip?: boolean;
  };

  const stateOrder: TxnState[] = [
    "created",
    "awaiting_payment",
    "paid",
    "dispatched",
    "delivered",
    "released",
    "payout_pending",
    "payout_approved",
    "completed",
  ];
  const currentIdx = stateOrder.indexOf(state);
  const isAtOrPast = (s: TxnState) => {
    const idx = stateOrder.indexOf(s);
    if (idx === -1) return false;
    return currentIdx >= idx;
  };

  const steps: Step[] = [
    {
      key: "placed",
      title: isService ? "Booking placed" : "Order placed",
      description: isService
        ? "Buyer started a protected booking on SBBS."
        : "Buyer started a protected order on SBBS.",
      icon: Receipt,
      done: true,
      timestamp: createdAt,
    },
    {
      key: "paid",
      title: "Payment held",
      description: "Funds are safely held by SBBS until the deal completes.",
      icon: CreditCard,
      done: Boolean(paidAt) || isAtOrPast("paid"),
      timestamp: paidAt,
      action:
        state === "awaiting_payment" && role === "buyer"
          ? ({ label: "Pay now", role: "buyer", kind: "pay" } as const)
          : undefined,
    },
    {
      key: "dispatched",
      title: isService ? "Provider started" : "Dispatched",
      description: isService
        ? "Seller has begun working on the job."
        : "Seller has handed the item to a rider/courier.",
      icon: Truck,
      done: Boolean(dispatchedAt) || isAtOrPast("dispatched"),
      timestamp: dispatchedAt,
      action:
        state === "paid" && role === "seller"
          ? ({ label: "Mark dispatched", role: "seller", kind: "dispatch" } as const)
          : undefined,
    },
    {
      key: "delivered",
      title: isService ? "Work completed" : "Delivered",
      description: isService
        ? "Seller ticks this when the service is finished."
        : "Seller ticks this once the item is handed to the buyer.",
      icon: PackageCheck,
      done: Boolean(deliveredAt) || isAtOrPast("delivered") || isAtOrPast("released"),
      timestamp: deliveredAt,
      action:
        state === "dispatched" && role === "seller"
          ? ({ label: "Mark delivered", role: "seller", kind: "deliver" } as const)
          : undefined,
    },
    {
      key: "released",
      title: isService ? "Payment released to seller" : "Buyer released payment",
      description:
        "Buyer confirms they got the goods/work and unlocks the payout.",
      icon: HandCoins,
      done: Boolean(releasedAt) || isAtOrPast("released"),
      timestamp: releasedAt,
      action:
        ["dispatched", "delivered"].includes(state) && role === "buyer"
          ? ({ label: "Confirm & release", role: "buyer", kind: "release" } as const)
          : undefined,
    },
    {
      key: "rider_paid",
      title: "Rider paid",
      description: "Rider/courier payout has settled to their MoMo.",
      icon: Wallet,
      done: riderPayout?.state === "paid",
      timestamp: riderPayout?.paidAt ?? null,
      skip: riderPayoutAmount <= 0,
    },
    {
      key: "seller_paid",
      title: isService ? "Provider paid" : "Seller paid",
      description: "Seller payout has settled to their MoMo.",
      icon: Wallet,
      done: sellerPayout?.state === "paid",
      timestamp: sellerPayout?.paidAt ?? null,
      skip: sellerPayoutAmount <= 0,
    },
    {
      key: "completed",
      title: "Completed",
      description: "All parties paid. Deal closed. Receipts available.",
      icon: CheckCircle2,
      done: state === "completed" || Boolean(completedAt),
      timestamp: completedAt,
    },
  ].filter((s) => !s.skip);

  const totalSteps = steps.length;
  const doneSteps = steps.filter((s) => s.done).length;
  const percent = Math.round((doneSteps / totalSteps) * 100);

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold">
            {isCancelled
              ? "Order cancelled"
              : isDisputed
                ? "Dispute open"
                : isService
                  ? "Service progress"
                  : "Order progress"}
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {isCancelled
              ? `Cancelled ${relativeTime(cancelledAt ?? createdAt)}.`
              : isDisputed
                ? "Progress is paused until the dispute is resolved."
                : `${doneSteps} of ${totalSteps} steps complete · updated ${relativeTime(
                    releasedAt ?? deliveredAt ?? dispatchedAt ?? paidAt ?? createdAt,
                  )}`}
          </p>
        </div>
        <span className="font-mono text-xs text-[var(--muted)]">{txnRef}</span>
      </div>

      {/* Progress bar — purely visual hint above the stepper. */}
      <div className="mt-4 h-1.5 rounded-full bg-[var(--surface-muted)] overflow-hidden">
        <div
          className={
            "h-full transition-all " +
            (isCancelled
              ? "bg-[var(--danger)]"
              : isDisputed
                ? "bg-[var(--warning,#d97706)]"
                : "bg-[var(--primary)]")
          }
          style={{ width: `${isCancelled ? 100 : isDisputed ? Math.max(percent, 15) : percent}%` }}
        />
      </div>

      {isCancelled && (
        <div className="mt-5 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--surface-muted)] border border-[var(--border)] p-3">
          <Ban size={16} className="mt-0.5 shrink-0 text-[var(--danger)]" />
          <p className="text-sm text-[var(--muted)]">
            This order was cancelled and is no longer active. If you paid, the refund reaches your
            original method within 3 business days.
          </p>
        </div>
      )}

      {isDisputed && (
        <div className="mt-5 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--primary-soft)] text-[var(--primary)] p-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p className="text-sm">
            A dispute is open — funds stay safely held until SBBS reviews. Upload any evidence from
            this page.
          </p>
        </div>
      )}

      <ol className="mt-6 space-y-5">
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;
          const isCurrent =
            !step.done &&
            steps.slice(0, idx).every((s) => s.done) &&
            !isCancelled &&
            !isDisputed;

          return (
            <li key={step.key} className="relative flex gap-4">
              {/* Vertical connector line (skipped on the last item) */}
              {!isLast && (
                <span
                  aria-hidden
                  className={
                    "absolute left-[15px] top-9 bottom-[-1.25rem] w-px " +
                    (step.done ? "bg-[var(--primary)]/40" : "bg-[var(--border)]")
                  }
                />
              )}

              <StepIcon done={step.done} current={isCurrent} icon={step.icon} />

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <p
                    className={
                      "font-medium " + (step.done ? "" : isCurrent ? "" : "text-[var(--muted)]")
                    }
                  >
                    {step.title}
                  </p>
                  {step.done && step.timestamp && (
                    <span className="text-xs text-[var(--muted)]">
                      · {relativeTime(step.timestamp)}
                    </span>
                  )}
                  {isCurrent && (
                    <span className="text-xs rounded-full px-2 py-0.5 bg-[var(--primary-soft)] text-[var(--primary)] font-semibold uppercase tracking-[0.12em]">
                      Now
                    </span>
                  )}
                </div>
                <p className="text-sm text-[var(--muted)] mt-0.5">{step.description}</p>

                {/* Inline tick / call-to-action — only the participant whose turn it is sees this. */}
                {step.action && !isCancelled && !isDisputed && (
                  <div className="mt-3">
                    {step.action.kind === "pay" ? (
                      <Link href={`/buy/checkout?ref=${encodeURIComponent(txnRef)}`}>
                        <Button size="sm">
                          <CreditCard size={14} /> {step.action.label}
                        </Button>
                      </Link>
                    ) : (
                      <TxnProgressTickButton
                        txnRef={txnRef}
                        kind={step.action.kind}
                        label={step.action.label}
                      />
                    )}
                  </div>
                )}

                {/* Display-only payout amount hint for "rider paid" / "seller paid" rows. */}
                {step.key === "rider_paid" && riderPayoutAmount > 0 && !step.done && (
                  <p className="text-xs text-[var(--muted)] mt-1">
                    Queued — {formatGhs(riderPayoutAmount)} will hit the rider&rsquo;s MoMo once an
                    SBBS approver clears it.
                  </p>
                )}
                {step.key === "seller_paid" && sellerPayoutAmount > 0 && !step.done && (
                  <p className="text-xs text-[var(--muted)] mt-1">
                    Queued — {formatGhs(sellerPayoutAmount)} will settle to the seller&rsquo;s MoMo
                    once an SBBS approver clears it.
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function StepIcon({
  done,
  current,
  icon: Icon,
}: {
  done: boolean;
  current: boolean;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  if (done) {
    return (
      <span className="relative z-[1] inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[var(--shadow-soft)]">
        <CheckCircle2 size={16} />
      </span>
    );
  }
  if (current) {
    return (
      <span className="relative z-[1] inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)] ring-2 ring-[var(--primary)]/40">
        <Icon size={16} />
      </span>
    );
  }
  return (
    <span className="relative z-[1] inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--muted)] border border-[var(--border-strong)]">
      <Icon size={16} />
    </span>
  );
}
