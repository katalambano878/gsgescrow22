export type TxnState =
  | "created"
  | "awaiting_payment"
  | "paid"
  | "dispatched"
  | "delivered"
  | "released"
  | "disputed"
  | "refund_issued"
  | "partial_refund"
  | "payout_pending"
  | "payout_approved"
  | "payout_failed"
  | "completed"
  | "cancelled";

const ALLOWED: Record<TxnState, TxnState[]> = {
  created: ["awaiting_payment", "cancelled"],
  awaiting_payment: ["paid", "cancelled"],
  paid: ["dispatched", "disputed", "cancelled"],
  // Allow dispatched → released directly so the rider can release with the
  // buyer's code at the door without first stopping at the optional
  // "delivered" milestone (which is only the seller's confirmation tick).
  dispatched: ["delivered", "released", "disputed"],
  delivered: ["released", "disputed"],
  released: ["payout_pending"],
  disputed: ["refund_issued", "partial_refund", "released", "payout_pending"],
  refund_issued: ["completed"],
  partial_refund: ["payout_pending", "completed"],
  payout_pending: ["payout_approved", "payout_failed"],
  payout_approved: ["completed", "payout_failed"],
  payout_failed: ["payout_pending"],
  completed: [],
  cancelled: [],
};

const STATE_LABELS: Record<TxnState, string> = {
  created: "Created",
  awaiting_payment: "Awaiting payment",
  paid: "Held",
  dispatched: "In transit",
  delivered: "Delivered",
  released: "Released",
  disputed: "Disputed",
  refund_issued: "Refunded",
  partial_refund: "Partially refunded",
  payout_pending: "Payout pending",
  payout_approved: "Payout approved",
  payout_failed: "Payout failed",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATE_TONES: Record<
  TxnState,
  "neutral" | "info" | "success" | "warning" | "danger" | "accent"
> = {
  created: "neutral",
  awaiting_payment: "warning",
  paid: "info",
  dispatched: "accent",
  delivered: "accent",
  released: "success",
  disputed: "danger",
  refund_issued: "neutral",
  partial_refund: "neutral",
  payout_pending: "info",
  payout_approved: "info",
  payout_failed: "danger",
  completed: "success",
  cancelled: "neutral",
};

export function canTransition(from: TxnState, to: TxnState): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function assertTransition(from: TxnState, to: TxnState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid state transition: ${from} -> ${to}`);
  }
}

export function stateLabel(s: TxnState): string {
  return STATE_LABELS[s] ?? s;
}

export function stateTone(s: TxnState) {
  return STATE_TONES[s] ?? "neutral";
}

export function isTerminal(s: TxnState): boolean {
  return s === "completed" || s === "cancelled";
}

export function isInDispute(s: TxnState): boolean {
  return s === "disputed";
}

export function isMoneyHeld(s: TxnState): boolean {
  return ["paid", "dispatched", "delivered", "disputed"].includes(s);
}
