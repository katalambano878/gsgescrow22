"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { calculateFees, DEFAULT_FEE_RATES, type PayoutChannel } from "@/lib/payments";
import { formatGhs, ghsToPesewas } from "@/lib/utils";

export function CalculatorWidget() {
  const [productCedis, setProductCedis] = useState("420");
  const [deliveryCedis, setDeliveryCedis] = useState("35");
  const [channel, setChannel] = useState<PayoutChannel>("momo");

  const fees = useMemo(() => {
    const product = ghsToPesewas(productCedis || "0");
    const delivery = ghsToPesewas(deliveryCedis || "0");
    return calculateFees({
      productAmount: product,
      deliveryAmount: delivery,
      riderPayoutChannel: channel,
      sellerPayoutChannel: channel,
      ...DEFAULT_FEE_RATES,
    });
  }, [productCedis, deliveryCedis, channel]);

  const momoBpsPct = DEFAULT_FEE_RATES.sellerReleaseMomoBps / 100;
  const momoCapLabel = formatGhs(DEFAULT_FEE_RATES.sellerReleaseMomoCap);
  const bankLabel = formatGhs(DEFAULT_FEE_RATES.sellerReleaseBank);

  return (
    <div className="grid lg:grid-cols-12 gap-6">
      <Card className="p-6 lg:col-span-5">
        <h3 className="font-display text-lg font-semibold">Order details</h3>
        <p className="text-sm text-[var(--muted)] mt-1">
          Enter the agreed price and delivery fee.
        </p>
        <div className="mt-6 space-y-5">
          <div>
            <Label htmlFor="product">Product / service price</Label>
            <Input
              id="product"
              inputMode="decimal"
              value={productCedis}
              onChange={(e) => setProductCedis(e.target.value)}
              leading="₵"
            />
          </div>
          <div>
            <Label htmlFor="delivery">Delivery / travel fee</Label>
            <Input
              id="delivery"
              inputMode="decimal"
              value={deliveryCedis}
              onChange={(e) => setDeliveryCedis(e.target.value)}
              leading="₵"
            />
          </div>
          <div>
            <Label>Release channel</Label>
            <div className="mt-2 inline-flex rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1 w-full">
              <ChannelButton
                active={channel === "momo"}
                onClick={() => setChannel("momo")}
                title="MoMo (Moolre)"
                subtitle={`${momoBpsPct}% · cap ${momoCapLabel}`}
              />
              <ChannelButton
                active={channel === "bank"}
                onClick={() => setChannel("bank")}
                title="Bank (Paystack)"
                subtitle={`Flat ${bankLabel}`}
              />
            </div>
            <p className="text-xs text-[var(--muted)] mt-3 leading-relaxed">
              MoMo releases use a percentage with a cap so small orders stay cheap.
              Bank releases are a flat fee because each transfer costs the same.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6 lg:p-8 lg:col-span-7 bg-[var(--primary)] text-[var(--primary-foreground)] border-0 shadow-[var(--shadow-pop)]">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="font-display text-xl font-bold">What everyone pays</h3>
          <Badge tone="accent">Live preview</Badge>
        </div>

        <div className="mt-6 space-y-4">
          <Block title="Buyer pays SBBS">
            <Row
              label="Product"
              value={formatGhs(ghsToPesewas(productCedis || "0"))}
            />
            <Row
              label="Delivery"
              value={formatGhs(ghsToPesewas(deliveryCedis || "0"))}
            />
            <Row
              label={`Buyer fee (${DEFAULT_FEE_RATES.buyerFeeBps / 100}%)`}
              value={formatGhs(fees.buyerFee)}
            />
            {fees.riderReleaseFee > 0 && (
              <Row
                label={`Rider release · ${channel === "momo" ? "MoMo" : "Bank"}`}
                value={formatGhs(fees.riderReleaseFee)}
              />
            )}
            <Row total label="Total" value={formatGhs(fees.totalCharged)} />
          </Block>

          <Block title="Seller receives" tone="accent">
            <Row
              label="Product"
              value={formatGhs(ghsToPesewas(productCedis || "0"))}
            />
            <Row
              label={`Seller fee (${DEFAULT_FEE_RATES.sellerFeeBps / 100}%)`}
              value={`- ${formatGhs(fees.sellerFee)}`}
            />
            <Row
              label={`Seller release · ${channel === "momo" ? "MoMo" : "Bank"}`}
              value={`- ${formatGhs(fees.sellerReleaseFee)}`}
            />
            <Row
              total
              label={channel === "momo" ? "Net to MoMo" : "Net to bank"}
              value={formatGhs(fees.sellerPayout)}
            />
          </Block>

          {fees.riderPayout > 0 && (
            <Block title="Rider receives">
              <Row
                total
                label={channel === "momo" ? "Net to MoMo" : "Net to bank"}
                value={formatGhs(fees.riderPayout)}
              />
            </Block>
          )}
        </div>

        <p className="text-xs text-white/60 mt-6 leading-relaxed">
          Other PSP, telco, and bank charges may still apply on top of these. Provider fees
          (Moolre / Paystack) are passed through and never marked up.
        </p>
      </Card>
    </div>
  );
}

function ChannelButton({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex-1 rounded-[calc(var(--radius-md)-2px)] px-3 py-2 text-left transition " +
        (active
          ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[var(--shadow-soft)]"
          : "text-[var(--muted)] hover:text-[var(--foreground)]")
      }
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className="block text-[11px] opacity-80">{subtitle}</span>
    </button>
  );
}

function Block({
  title,
  children,
  tone = "default",
}: {
  title: string;
  children: React.ReactNode;
  tone?: "default" | "accent";
}) {
  return (
    <div
      className={
        "rounded-[var(--radius-md)] p-4 border " +
        (tone === "accent"
          ? "border-[var(--accent)]/40 bg-[var(--accent)]/10"
          : "border-white/15 bg-white/5")
      }
    >
      <p className="text-xs uppercase tracking-[0.14em] font-semibold text-white/70">
        {title}
      </p>
      <div className="mt-3 space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  total,
}: {
  label: string;
  value: string;
  total?: boolean;
}) {
  return (
    <div
      className={
        total
          ? "flex justify-between items-baseline mt-3 pt-3 border-t border-white/15 font-display font-bold text-lg"
          : "flex justify-between items-baseline text-sm"
      }
    >
      <span className={total ? "" : "text-white/75"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
