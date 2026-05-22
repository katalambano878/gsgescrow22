"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import {
  markDispatched,
  markDelivered,
  confirmDelivery,
} from "@/lib/actions/transaction";

type TickKind = "dispatch" | "deliver" | "release";

export function TxnProgressTickButton({
  txnRef,
  kind,
  label,
}: {
  txnRef: string;
  kind: TickKind;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function go() {
    startTransition(async () => {
      let r: { ok: boolean; error?: string };
      switch (kind) {
        case "dispatch":
          r = await markDispatched(txnRef);
          break;
        case "deliver":
          r = await markDelivered(txnRef);
          break;
        case "release":
          // Pass undefined so the buyer's session is used to authorise; the
          // 6-digit code path is still available from the existing Actions
          // card if a rider hands the buyer the code in person.
          r = await confirmDelivery(txnRef, undefined);
          break;
      }
      if (!r.ok) {
        toast.error(r.error ?? "Something went wrong");
        return;
      }
      toast.success(
        kind === "release"
          ? "Marked received. Payout queued for SBBS approval."
          : kind === "deliver"
            ? "Marked delivered. Buyer notified to confirm."
            : "Marked dispatched. Buyer notified.",
      );
      router.refresh();
    });
  }

  return (
    <Button size="sm" loading={pending} onClick={go}>
      <CheckCircle2 size={14} /> {label}
    </Button>
  );
}
