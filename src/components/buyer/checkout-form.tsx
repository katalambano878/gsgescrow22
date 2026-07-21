"use client";

import type { ReactNode } from "react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { initializeCheckoutPayment } from "@/lib/actions/transaction";
import { Smartphone, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

export function CheckoutForm({
  refCode,
  totalLabel,
  momoAvailable,
  cardAvailable,
  cardVisible = true,
  embedded = false,
}: {
  refCode: string;
  totalLabel: string;
  momoAvailable: boolean;
  cardAvailable: boolean;
  cardVisible?: boolean;
  /** When true, methods sit inside a parent panel (no outer max-width / card chrome). */
  embedded?: boolean;
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

  if (!cardVisible) {
    return (
      <div className={cn(!embedded && "max-w-md")}>
        <div className="flex items-start gap-4">
          <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
            <Smartphone size={22} strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display font-semibold text-lg leading-tight">Mobile Money</h2>
            <p className="text-sm text-[var(--muted)] mt-1.5 leading-relaxed">
              MTN, Telecel, or AirtelTigo via Moolre. You&rsquo;ll approve {totalLabel} on their
              secure page.
            </p>
          </div>
        </div>
        <Button
          className="w-full mt-6 h-12 text-base"
          loading={pending}
          disabled={!momoAvailable}
          title={!momoAvailable ? "Mobile Money checkout is not configured." : undefined}
          onClick={() => pay("momo")}
        >
          Pay {totalLabel} with Mobile Money
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-3",
        cardVisible && "sm:grid-cols-2",
        !embedded && "max-w-2xl",
      )}
    >
      <MethodTile
        icon={<Smartphone size={20} strokeWidth={1.75} />}
        title="Mobile Money"
        description={`MTN, Telecel, or AirtelTigo — ${totalLabel}`}
        actionLabel="Pay with MoMo"
        loading={pending}
        disabled={!momoAvailable}
        disabledTitle="Mobile Money checkout is not configured."
        onClick={() => pay("momo")}
        primary
      />
      <MethodTile
        icon={<CreditCard size={20} strokeWidth={1.75} />}
        title="Card"
        description={`Visa / Mastercard via Paystack — ${totalLabel}`}
        actionLabel="Pay with card"
        loading={pending}
        disabled={!cardAvailable}
        disabledTitle="Card checkout requires Paystack to be configured."
        onClick={() => pay("card")}
      />
    </div>
  );
}

function MethodTile({
  icon,
  title,
  description,
  actionLabel,
  loading,
  disabled,
  disabledTitle,
  onClick,
  primary,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  loading: boolean;
  disabled: boolean;
  disabledTitle: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--background)]/60 p-5 flex flex-col">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
        {icon}
      </div>
      <h2 className="font-display font-semibold mt-3">{title}</h2>
      <p className="text-sm text-[var(--muted)] mt-1.5 flex-1 leading-relaxed">{description}</p>
      <Button
        className="w-full mt-5"
        variant={primary ? "primary" : "secondary"}
        loading={loading}
        disabled={disabled}
        title={disabled ? disabledTitle : undefined}
        onClick={onClick}
      >
        {actionLabel}
      </Button>
    </div>
  );
}
