"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Truck, ShieldCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  markDispatched,
  confirmDelivery,
  cancelTransaction,
} from "@/lib/actions/transaction";
import { openDispute } from "@/lib/actions/dispute";
import type { TxnState } from "@/lib/state/transaction";

export function TxnActions({
  txnRef,
  role,
  state,
  hasOpenDispute,
}: {
  txnRef: string;
  role: "buyer" | "seller" | "guest";
  state: TxnState;
  hasOpenDispute: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [riderName, setRiderName] = useState("");
  const [riderPhone, setRiderPhone] = useState("");
  const [code, setCode] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");

  function action(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error ?? "Something went wrong");
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  if (role === "guest") {
    return (
      <Card className="p-5">
        <p className="text-sm text-[var(--muted)]">
          Sign in as a participant to act on this deal.
        </p>
        <Link href="/login" className="block mt-3">
          <Button className="w-full" size="sm">Sign in</Button>
        </Link>
      </Card>
    );
  }

  const canDispatch = role === "seller" && state === "paid";
  const canConfirm = role === "buyer" && (state === "dispatched" || state === "delivered");
  const canDispute = !hasOpenDispute && ["paid", "dispatched", "delivered"].includes(state);
  const canCancel = state === "created" || state === "awaiting_payment";
  const canPay = role === "buyer" && state === "awaiting_payment";

  return (
    <Card className="p-5 space-y-4">
      <h3 className="font-display font-semibold">Actions</h3>

      {canPay && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Complete payment</p>
          <p className="text-xs text-[var(--muted)]">
            Pay with Mobile Money on the secure checkout page.
          </p>
          <Link href={`/buy/checkout?ref=${encodeURIComponent(txnRef)}`} className="block">
            <Button className="w-full" size="sm">
              Go to checkout
            </Button>
          </Link>
        </div>
      )}

      {canDispatch && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Mark as dispatched</p>
          <p className="text-xs text-[var(--muted)]">
            We&rsquo;ll SMS a 6-digit delivery code straight to the buyer.
            Your rider will ask the buyer for that code at the door to complete
            the order — you never see it.
          </p>
          <Input
            placeholder="Rider name (optional)"
            value={riderName}
            onChange={(e) => setRiderName(e.target.value)}
          />
          <Input
            placeholder="Rider phone (optional)"
            value={riderPhone}
            onChange={(e) => setRiderPhone(e.target.value)}
          />
          <Button
            className="w-full"
            loading={isPending}
            onClick={() =>
              action(
                () => markDispatched(txnRef, { riderName, riderPhone }),
                "Marked dispatched. Buyer has the delivery code.",
              )
            }
          >
            <Truck size={14} /> I&rsquo;ve dispatched
          </Button>
        </div>
      )}

      {canConfirm && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Confirm delivery</p>
          <p className="text-xs text-[var(--muted)]">
            Inspect the goods first. Once you confirm, the seller&rsquo;s payout enters the queue.
            <br />
            The rider can also confirm directly using your 6-digit code (sent to you over SMS).
          </p>
          <Input
            inputMode="numeric"
            placeholder="6-digit code (optional)"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="font-mono tracking-[0.4em] text-center"
          />
          <Button
            className="w-full"
            loading={isPending}
            onClick={() =>
              action(
                () => confirmDelivery(txnRef, code || undefined),
                "Delivery confirmed. Payout queued.",
              )
            }
          >
            <CheckCircle2 size={14} /> Release payout
          </Button>
        </div>
      )}

      {canDispute && !showDispute && (
        <Button variant="secondary" className="w-full" onClick={() => setShowDispute(true)}>
          <AlertTriangle size={14} /> Open a dispute
        </Button>
      )}

      {showDispute && (
        <div className="space-y-2 rounded-md border border-[var(--border-strong)] p-3 bg-[var(--surface-muted)]/30">
          <Label>What&rsquo;s wrong?</Label>
          <Input
            placeholder="e.g. Wrong item, damaged, never arrived"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Label>Tell us more</Label>
          <Textarea
            rows={3}
            placeholder="Explain what happened. You can upload evidence on the next screen."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowDispute(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={isPending}
              onClick={() =>
                action(
                  () => openDispute({ ref: txnRef, role, reason, description }),
                  "Dispute opened. Transaction frozen.",
                )
              }
            >
              <ShieldCheck size={14} /> Open dispute
            </Button>
          </div>
        </div>
      )}

      {canCancel && (
        <Button
          variant="ghost"
          className="w-full text-[var(--danger)]"
          loading={isPending}
          onClick={() => action(() => cancelTransaction(txnRef, "User cancelled"), "Cancelled")}
        >
          Cancel this order
        </Button>
      )}
    </Card>
  );
}
