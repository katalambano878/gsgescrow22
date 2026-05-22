"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { initializeCheckoutPayment } from "@/lib/actions/transaction";
import { Smartphone, CreditCard } from "lucide-react";

export function CheckoutForm({
  refCode,
  totalLabel,
  momoAvailable,
  cardAvailable,
  cardVisible = true,
}: {
  refCode: string;
  totalLabel: string;
  momoAvailable: boolean;
  cardAvailable: boolean;
  cardVisible?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function pay(method: "momo" | "card") {
    startTransition(async () => {
      const r = await initializeCheckoutPayment(refCode, method);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      window.location.assign(r.authorizationUrl);
    });
  }

  return (
    <div
      className={
        "grid gap-4 " + (cardVisible ? "sm:grid-cols-2 max-w-2xl" : "max-w-md")
      }
    >
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-6 flex flex-col">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
          <Smartphone size={22} />
        </div>
        <h2 className="font-display font-semibold text-lg mt-4">Mobile Money</h2>
        <p className="text-sm text-[var(--muted)] mt-2 flex-1">
          MTN, Telecel, or AirtelTigo — powered by Moolre. You&rsquo;ll complete payment on their secure
          page ({totalLabel}).
        </p>
        <Button
          className="w-full mt-6"
          loading={pending}
          disabled={!momoAvailable}
          title={!momoAvailable ? "Mobile Money checkout is not configured." : undefined}
          onClick={() => pay("momo")}
        >
          Pay with Mobile Money
        </Button>
      </div>

      {cardVisible && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-6 flex flex-col">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
            <CreditCard size={22} />
          </div>
          <h2 className="font-display font-semibold text-lg mt-4">Card payments</h2>
          <p className="text-sm text-[var(--muted)] mt-2 flex-1">
            Visa, Mastercard, and other cards accepted by Paystack — card channel only ({totalLabel}).
          </p>
          <Button
            className="w-full mt-6"
            variant="secondary"
            loading={pending}
            disabled={!cardAvailable}
            title={!cardAvailable ? "Card checkout requires Paystack to be configured." : undefined}
            onClick={() => pay("card")}
          >
            Pay with card
          </Button>
        </div>
      )}
    </div>
  );
}
