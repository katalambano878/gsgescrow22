import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, ShieldCheck } from "lucide-react";
import { Container, Section } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { MarketingNav } from "@/components/marketing/nav";
import { CheckoutForm } from "@/components/buyer/checkout-form";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import { isCardCheckoutEnabled, isDbLive, isMoolreLive, isPaystackLive } from "@/lib/env";
import { formatGhs } from "@/lib/utils";
import { StateBadge } from "@/components/ui/badge";
import type { TxnState } from "@/lib/state/transaction";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout" };

function displayItemTitle(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t || /^none$/i.test(t) || /^null$/i.test(t) || /^undefined$/i.test(t)) {
    return "Protected purchase";
  }
  return t;
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref: refParam } = await searchParams;
  const ref = refParam?.trim();
  if (!ref || !isDbLive) notFound();

  const db = getDb();
  const [txn] = await db.select().from(transactions).where(eq(transactions.ref, ref)).limit(1);
  if (!txn) notFound();

  const stubMode = !isMoolreLive && !isPaystackLive;
  const momoAvailable = stubMode || isMoolreLive;
  const cardVisible = isCardCheckoutEnabled;
  const cardAvailable = cardVisible;
  const itemTitle = displayItemTitle(txn.itemDescription);
  const totalLabel = formatGhs(txn.totalCharged);

  if (txn.state !== "awaiting_payment") {
    return (
      <>
        <MarketingNav />
        <Section className="bg-paper min-h-[80vh]">
          <Container size="sm">
            <div className="max-w-md mx-auto">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Checkout
              </p>
              <h1 className="font-display text-3xl font-bold mt-3 tracking-tight">
                No payment needed
              </h1>
              <p className="mt-3 text-[var(--muted)] leading-relaxed">
                This order is no longer awaiting payment. Open your Hub to see the latest status.
              </p>
              <div className="mt-8 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 flex flex-wrap items-center gap-3">
                <StateBadge state={txn.state as TxnState} />
                <span className="font-mono text-sm text-[var(--muted)]">{txn.ref}</span>
              </div>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link href="/hub">
                  <Button className="w-full sm:w-auto">Open Hub</Button>
                </Link>
                <Link href={`/track/${encodeURIComponent(txn.ref)}`}>
                  <Button variant="secondary" className="w-full sm:w-auto">
                    Track order
                  </Button>
                </Link>
              </div>
            </div>
          </Container>
        </Section>
      </>
    );
  }

  const lines = [
    { label: "Item", amount: txn.productAmount },
    ...(txn.deliveryAmount > 0
      ? [{ label: "Delivery", amount: txn.deliveryAmount }]
      : []),
    ...(txn.buyerFee > 0 ? [{ label: "Buyer protection fee", amount: txn.buyerFee }] : []),
  ];

  return (
    <>
      <MarketingNav />
      <Section className="relative min-h-[80vh] overflow-hidden bg-paper">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent)]"
        />
        <Container size="sm" className="relative">
          <div className="max-w-md mx-auto">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)] shadow-[0_1px_0_#00000006]">
                <Lock size={12} className="text-[var(--primary)]" strokeWidth={2.25} />
                Secure checkout
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold mt-5 tracking-tight text-balance">
                {cardVisible ? "Choose how to pay" : "Pay with Mobile Money"}
              </h1>
              <p className="mt-3 text-[var(--muted)] leading-relaxed text-pretty">
                Funds stay protected until delivery is confirmed.
              </p>
            </div>

            <div className="mt-8 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)] overflow-hidden">
              <div className="px-6 pt-6 pb-5 sm:px-7 sm:pt-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                  You&rsquo;re paying for
                </p>
                <h2 className="font-display font-semibold text-xl mt-2 tracking-tight text-balance">
                  {itemTitle}
                </h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  To <span className="text-[var(--foreground)] font-medium">{txn.sellerName}</span>
                  <span className="mx-1.5 text-[var(--border-strong)]">·</span>
                  <span className="font-mono text-xs tracking-wide">{txn.ref}</span>
                </p>

                <dl className="mt-6 space-y-2.5 text-sm">
                  {lines.map((line) => (
                    <div key={line.label} className="flex items-baseline justify-between gap-4">
                      <dt className="text-[var(--muted)]">{line.label}</dt>
                      <dd className="font-medium tabular-nums">{formatGhs(line.amount)}</dd>
                    </div>
                  ))}
                  <div className="flex items-baseline justify-between gap-4 pt-3 mt-1 border-t border-[var(--border)]">
                    <dt className="font-display font-semibold">Total due</dt>
                    <dd className="font-display text-2xl font-bold tabular-nums tracking-tight">
                      {totalLabel}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="border-t border-[var(--border)] bg-[var(--surface-muted)]/50 px-6 py-6 sm:px-7">
                <CheckoutForm
                  refCode={txn.ref}
                  totalLabel={totalLabel}
                  momoAvailable={momoAvailable}
                  cardAvailable={cardAvailable}
                  cardVisible={cardVisible}
                  embedded
                />
              </div>
            </div>

            <p className="mt-6 flex items-start justify-center gap-2 text-center text-xs text-[var(--muted)] leading-relaxed max-w-sm mx-auto">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-[var(--success)]" />
              <span>
                After you pay, you&rsquo;ll return here while we confirm with the provider. Refresh
                once if status is slow — webhooks usually land within seconds.
              </span>
            </p>
          </div>
        </Container>
      </Section>
    </>
  );
}
