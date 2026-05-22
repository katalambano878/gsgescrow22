"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, KeyRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { confirmDelivery } from "@/lib/actions/transaction";

/**
 * Public, no-auth form that lets a rider (or anyone the buyer hands the code
 * to) confirm delivery using the 6-digit code that was SMS'd to the buyer.
 * The code is checked server-side against a SHA-256 hash, so guessing isn't
 * feasible (10⁶ space + a single-use code per transaction).
 */
export function RiderConfirmCard({ txnRef }: { txnRef: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) {
      toast.error("Enter the 6-digit code the buyer received over SMS");
      return;
    }
    startTransition(async () => {
      const r = await confirmDelivery(txnRef, code);
      if (!r.ok) {
        toast.error(r.error ?? "Could not confirm delivery");
        return;
      }
      toast.success("Delivery confirmed — payout queued.");
      setCode("");
      router.refresh();
    });
  }

  return (
    <Card className="mt-6 p-5 sm:p-6 border-[var(--primary)]/40 bg-[var(--primary-soft)]">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] shrink-0">
          <KeyRound size={16} />
        </span>
        <div className="flex-1">
          <h2 className="font-display font-semibold text-lg">
            Rider — complete this delivery
          </h2>
          <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">
            Ask the buyer for their 6-digit SBBS delivery code (sent by SMS at
            dispatch). Enter it below to mark the order delivered and release the
            payout. The seller does not see this code — only the buyer does.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-5 space-y-3">
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          aria-label="Six-digit delivery code"
          value={code}
          placeholder="• • • • • •"
          onChange={(e) =>
            setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
          className="font-mono text-center tracking-[0.5em] text-xl bg-[var(--surface)]"
        />
        <Button
          type="submit"
          loading={pending}
          disabled={code.length !== 6}
          className="w-full"
        >
          <CheckCircle2 size={14} /> Confirm delivery
        </Button>
        <p className="text-[11px] text-[var(--muted)] text-center">
          You can also confirm by signing into the buyer&rsquo;s Hub.
        </p>
      </form>
    </Card>
  );
}
