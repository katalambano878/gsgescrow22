"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, ShieldCheck, Lock, Package, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea, FieldHint } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { calculateFees } from "@/lib/payments";
import { formatGhs, ghsToPesewas } from "@/lib/utils";
import { createTransaction } from "@/lib/actions/transaction";

const BUYER_BPS = 150;
const SELLER_BPS = 150;
const RIDER_FEE = 200;
const SELLER_RELEASE_FEE = 200;

type OrderType = "product" | "service";

type Form = {
  orderType: OrderType;
  itemDescription: string;
  itemLink: string;
  productCedis: string;
  deliveryCedis: string;
  sellerName: string;
  sellerPhone: string;
  sellerEmail: string;
  sellerHandle: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string;
  deliveryAddress: string;
  deliveryCity: string;
};

const STEPS = [
  { n: 1, t: "What you're buying" },
  { n: 2, t: "Who from + where" },
  { n: 3, t: "Confirm and pay" },
];

export interface BuyerWizardPrefill {
  orderType?: OrderType;
  sellerHandle?: string;
  sellerName?: string;
  sellerPhone?: string;
  sellerEmail?: string;
  itemDescription?: string;
  itemLink?: string;
  productCedis?: string;
  deliveryCedis?: string;
}

export function BuyerWizard({
  prefill,
  sellerHandle,
}: {
  prefill?: BuyerWizardPrefill;
  sellerHandle?: string;
}) {
  const router = useRouter();
  const initial = prefill ?? { sellerHandle };
  const [step, setStep] = useState(initial.itemDescription && initial.productCedis ? 2 : 1);
  const [form, setForm] = useState<Form>({
    orderType: initial.orderType ?? "product",
    itemDescription: initial.itemDescription ?? "",
    itemLink: initial.itemLink ?? "",
    productCedis: initial.productCedis ?? "",
    deliveryCedis: initial.deliveryCedis ?? "0",
    sellerName: initial.sellerName ?? "",
    sellerPhone: initial.sellerPhone ?? "",
    sellerEmail: initial.sellerEmail ?? "",
    sellerHandle: initial.sellerHandle ?? "",
    buyerName: "",
    buyerPhone: "",
    buyerEmail: "",
    deliveryAddress: "",
    deliveryCity: "Accra",
  });
  const isService = form.orderType === "service";
  const [isPending, startTransition] = useTransition();

  const fees = useMemo(
    () =>
      calculateFees({
        productAmount: ghsToPesewas(form.productCedis || "0"),
        deliveryAmount: ghsToPesewas(form.deliveryCedis || "0"),
        buyerFeeBps: BUYER_BPS,
        sellerFeeBps: SELLER_BPS,
        riderReleaseFee: RIDER_FEE,
        sellerReleaseFee: SELLER_RELEASE_FEE,
      }),
    [form.productCedis, form.deliveryCedis],
  );

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function canNext(): boolean {
    if (step === 1)
      return Boolean(form.itemDescription && Number(form.productCedis) > 0);
    if (step === 2) {
      // Seller identity must include a phone AND at least one of
      // email/handle so we can (a) match them to an existing profile or
      // (b) issue a signed claim invite if they're new to SBBS.
      const hasSellerContact = Boolean(
        form.sellerEmail || form.sellerHandle,
      );
      return Boolean(
        form.sellerName &&
          form.sellerPhone &&
          hasSellerContact &&
          form.buyerName &&
          form.buyerPhone &&
          form.deliveryAddress &&
          form.deliveryCity,
      );
    }
    return true;
  }

  async function submit() {
    startTransition(async () => {
      const r = await createTransaction({
        initiatedBy: "buyer",
        orderType: form.orderType,
        buyerName: form.buyerName,
        buyerPhone: form.buyerPhone,
        buyerEmail: form.buyerEmail,
        sellerName: form.sellerName,
        sellerPhone: form.sellerPhone,
        sellerEmail: form.sellerEmail || undefined,
        sellerHandle: form.sellerHandle || undefined,
        itemDescription: form.itemDescription,
        itemLink: form.itemLink,
        deliveryAddress: form.deliveryAddress,
        deliveryCity: form.deliveryCity,
        productCedis: Number(form.productCedis),
        deliveryCedis: Number(form.deliveryCedis || "0"),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Order created — opening secure checkout");
      router.push(r.checkoutUrl);
    });
  }

  return (
    <div className="grid lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8">
        <Stepper step={step} />
        <Card className="p-6 sm:p-8 mt-6">
          {step === 1 && (
            <div className="space-y-5">
              <h3 className="font-display text-xl font-semibold">
                {isService ? "What service do you need?" : "What are you buying?"}
              </h3>

              <div>
                <Label required>Is this a product or a service?</Label>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <TypeOption
                    icon={Package}
                    label="Product"
                    description="A physical item that will be dispatched."
                    selected={form.orderType === "product"}
                    onClick={() => set("orderType", "product")}
                  />
                  <TypeOption
                    icon={Wrench}
                    label="Service"
                    description="Work the seller will perform for you."
                    selected={form.orderType === "service"}
                    onClick={() => set("orderType", "service")}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="item" required>
                  {isService ? "Describe the service" : "What's the item?"}
                </Label>
                <Textarea
                  id="item"
                  rows={3}
                  placeholder={
                    isService
                      ? "e.g. Bridal makeup, 6 am call time at the Tema address, full glam look"
                      : "e.g. Black kente dress, size M, the one in the second photo"
                  }
                  value={form.itemDescription}
                  onChange={(e) => set("itemDescription", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="link">
                  {isService ? "Link to the post / portfolio (optional)" : "Link to the post (optional)"}
                </Label>
                <Input
                  id="link"
                  placeholder="https://instagram.com/p/..."
                  value={form.itemLink}
                  onChange={(e) => set("itemLink", e.target.value)}
                />
                <FieldHint>
                  {isService
                    ? "Paste the IG/TikTok/portfolio link the seller showed you — keeps everyone on the same page."
                    : "Pasting the IG/TikTok/WhatsApp link helps the seller match your DM faster."}
                </FieldHint>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="price" required>Agreed price</Label>
                  <Input
                    id="price"
                    inputMode="decimal"
                    leading="₵"
                    value={form.productCedis}
                    onChange={(e) => set("productCedis", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="delivery">
                    {isService ? "Travel / call-out fee (if any)" : "Delivery fee (if any)"}
                  </Label>
                  <Input
                    id="delivery"
                    inputMode="decimal"
                    leading="₵"
                    value={form.deliveryCedis}
                    onChange={(e) => set("deliveryCedis", e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h3 className="font-display text-xl font-semibold">Who from + where</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="sn" required>Seller's name</Label>
                  <Input
                    id="sn"
                    placeholder="e.g. Ama from your favourite shop"
                    value={form.sellerName}
                    onChange={(e) => set("sellerName", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="sp" required>Seller's phone</Label>
                  <Input
                    id="sp"
                    placeholder="024 000 0000"
                    value={form.sellerPhone}
                    onChange={(e) => set("sellerPhone", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="se" required>Seller's email</Label>
                  <Input
                    id="se"
                    type="email"
                    placeholder="seller@example.com"
                    value={form.sellerEmail}
                    onChange={(e) => set("sellerEmail", e.target.value)}
                  />
                  <FieldHint>
                    We&rsquo;ll email the seller this order and a link to claim it &mdash; even if they
                    haven&rsquo;t signed up yet.
                  </FieldHint>
                </div>
                <div>
                  <Label htmlFor="sh">Seller's SBBS handle (optional)</Label>
                  <Input
                    id="sh"
                    placeholder="@kentecouture"
                    value={form.sellerHandle}
                    onChange={(e) => set("sellerHandle", e.target.value.replace(/^@/, ""))}
                  />
                  <FieldHint>If you know their handle, we&rsquo;ll link the order instantly.</FieldHint>
                </div>
              </div>
              <hr className="border-[var(--border)]" />
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bn" required>Your name</Label>
                  <Input
                    id="bn"
                    value={form.buyerName}
                    onChange={(e) => set("buyerName", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="bp" required>Your phone</Label>
                  <Input
                    id="bp"
                    placeholder="024 000 0000"
                    value={form.buyerPhone}
                    onChange={(e) => set("buyerPhone", e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="be">Your email (optional but recommended)</Label>
                <Input
                  id="be"
                  type="email"
                  placeholder="you@example.com"
                  value={form.buyerEmail}
                  onChange={(e) => set("buyerEmail", e.target.value)}
                />
                <FieldHint>For your receipt and Hub account.</FieldHint>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label htmlFor="da" required>
                    {isService ? "Service location address" : "Delivery address"}
                  </Label>
                  <Textarea
                    id="da"
                    rows={2}
                    placeholder={
                      isService
                        ? "Where the service should happen — full address, area, landmark"
                        : "House number, area, landmark"
                    }
                    value={form.deliveryAddress}
                    onChange={(e) => set("deliveryAddress", e.target.value)}
                  />
                  {isService && (
                    <FieldHint>
                      If it&rsquo;s remote (online tutoring, virtual design, etc) just say
                      &ldquo;Remote&rdquo; here.
                    </FieldHint>
                  )}
                </div>
                <div>
                  <Label htmlFor="dc" required>City</Label>
                  <Input
                    id="dc"
                    value={form.deliveryCity}
                    onChange={(e) => set("deliveryCity", e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <h3 className="font-display text-xl font-semibold">Review and pay</h3>
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] divide-y divide-[var(--border)]">
                <Detail label="Type" value={isService ? "Service" : "Product"} />
                <Detail label={isService ? "Service" : "Item"} value={form.itemDescription} />
                <Detail label="Seller" value={`${form.sellerName} · ${form.sellerPhone}`} />
                <Detail label="You" value={`${form.buyerName} · ${form.buyerPhone}`} />
                <Detail
                  label={isService ? "Service location" : "Delivery to"}
                  value={`${form.deliveryAddress}, ${form.deliveryCity}`}
                />
              </div>
              <div className="rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--muted)]">{isService ? "Service" : "Product"}</span>
                  <span className="font-medium">{formatGhs(ghsToPesewas(form.productCedis || "0"))}</span>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-[var(--muted)]">{isService ? "Travel / call-out" : "Delivery"}</span>
                  <span className="font-medium">{formatGhs(ghsToPesewas(form.deliveryCedis || "0"))}</span>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-[var(--muted)]">Buyer protection (1.5%)</span>
                  <span className="font-medium">{formatGhs(fees.buyerFee)}</span>
                </div>
                {fees.riderReleaseFee > 0 && (
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-[var(--muted)]">
                      {isService ? "Provider travel release fee" : "Rider release fee"}
                    </span>
                    <span className="font-medium">{formatGhs(fees.riderReleaseFee)}</span>
                  </div>
                )}
                {fees.sellerReleaseFee > 0 && (
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-[var(--muted)]">Seller release fee</span>
                    <span className="font-medium">{formatGhs(fees.sellerReleaseFee)}</span>
                  </div>
                )}
                <div className="border-t border-[var(--border)] mt-3 pt-3 flex justify-between items-baseline">
                  <span className="font-semibold">You pay SBBS</span>
                  <span className="font-display font-bold text-2xl">{formatGhs(fees.totalCharged)}</span>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--primary-soft)] text-[var(--primary)] p-3">
                <Lock size={16} className="mt-0.5 shrink-0" />
                <p className="text-sm">
                  {isService
                    ? "Your money is held safely until you confirm the service was completed. SBBS staff cannot touch funds."
                    : "Your money is held safely until you confirm the goods arrived. SBBS staff cannot touch funds."}
                </p>
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <Button
              variant="ghost"
              type="button"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
            >
              <ArrowLeft size={16} /> Back
            </Button>
            {step < 3 ? (
              <Button
                type="button"
                onClick={() => canNext() && setStep((s) => s + 1)}
                disabled={!canNext()}
              >
                Continue <ArrowRight size={16} />
              </Button>
            ) : (
              <Button type="button" onClick={submit} loading={isPending}>
                <ShieldCheck size={16} /> Pay {formatGhs(fees.totalCharged)} safely
              </Button>
            )}
          </div>
        </Card>
      </div>

      <aside className="lg:col-span-4">
        <Card className="p-6 lg:sticky lg:top-24">
          <Badge tone="success" dot>Protected by SBBS</Badge>
          <h3 className="font-display text-lg font-semibold mt-4">
            What happens next
          </h3>
          <ol className="mt-4 space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="font-mono text-xs text-[var(--muted)]">01</span>
              <span>You pay SBBS via Mobile Money or card.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-xs text-[var(--muted)]">02</span>
              <span>
                {isService
                  ? "The provider is SMS\u2019d that funds are held and begins the job."
                  : "The seller is SMS\u2019d that funds are held and dispatches."}
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-xs text-[var(--muted)]">03</span>
              <span>
                {isService
                  ? "You confirm the work was completed, then share the delivery code."
                  : "You inspect, then release the delivery code."}
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-xs text-[var(--muted)]">04</span>
              <span>SBBS approver releases payout to the seller&rsquo;s MoMo.</span>
            </li>
          </ol>
        </Card>
      </aside>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-3">
      {STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center gap-3 flex-1">
          <div
            className={
              "flex items-center gap-3 px-3 py-2 rounded-full text-sm font-medium " +
              (step === s.n
                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                : step > s.n
                  ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                  : "bg-[var(--surface)] text-[var(--muted)] border border-[var(--border-strong)]")
            }
          >
            <span className="font-mono text-xs">0{s.n}</span>
            <span className="hidden sm:inline">{s.t}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className="flex-1 h-px bg-[var(--border-strong)]" />
          )}
        </div>
      ))}
    </div>
  );
}

function TypeOption({
  icon: Icon,
  label,
  description,
  selected,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={
        "text-left rounded-[var(--radius-md)] border p-4 transition-all " +
        (selected
          ? "border-[var(--primary)] bg-[var(--primary-soft)] shadow-[var(--shadow-soft)]"
          : "border-[var(--border-strong)] bg-[var(--surface)] hover:border-[var(--primary)]/40")
      }
    >
      <div className="flex items-center gap-3">
        <span
          className={
            "inline-flex h-9 w-9 items-center justify-center rounded-lg " +
            (selected
              ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
              : "bg-[var(--surface-muted)] text-[var(--muted)]")
          }
        >
          <Icon size={18} />
        </span>
        <p className={"font-display font-semibold " + (selected ? "text-[var(--primary)]" : "")}>
          {label}
        </p>
      </div>
      <p className="mt-2 text-xs text-[var(--muted)] leading-relaxed">{description}</p>
    </button>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3 flex items-baseline justify-between gap-4">
      <span className="text-xs uppercase tracking-[0.14em] font-semibold text-[var(--muted)] shrink-0">
        {label}
      </span>
      <span className="text-sm text-right">{value}</span>
    </div>
  );
}
