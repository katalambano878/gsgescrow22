import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, Section, Eyebrow } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
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
  // Card checkout is only shown when both Paystack is configured AND the
  // CARD_PAYMENTS_ENABLED kill-switch is on. In stub/dev mode the tile is
  // also hidden to keep the UI clean and predictable.
  const cardVisible = isCardCheckoutEnabled;
  const cardAvailable = cardVisible;

  if (txn.state !== "awaiting_payment") {
    return (
      <>
        <MarketingNav />
        <Section className="bg-paper min-h-[80vh]">
          <Container size="sm">
            <Eyebrow>Checkout</Eyebrow>
            <h1 className="font-display text-3xl font-bold mt-4 tracking-tight">
              No payment needed
            </h1>
            <p className="mt-3 text-[var(--muted)]">
              This order is no longer awaiting payment. Open your Hub to see the latest status.
            </p>
            <Card className="mt-8 p-6 flex flex-wrap items-center gap-3">
              <StateBadge state={txn.state as TxnState} />
              <span className="font-mono text-sm text-[var(--muted)]">{txn.ref}</span>
            </Card>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/hub">
                <Button>Open Hub</Button>
              </Link>
              <Link href={`/track/${encodeURIComponent(txn.ref)}`}>
                <Button variant="secondary">Track order</Button>
              </Link>
            </div>
          </Container>
        </Section>
      </>
    );
  }

  return (
    <>
      <MarketingNav />
      <Section className="bg-paper min-h-[80vh]">
        <Container size="lg">
          <Eyebrow>Secure checkout</Eyebrow>
          <h1 className="font-display text-4xl sm:text-5xl font-bold mt-4 tracking-tight">
            {cardVisible ? "Choose how you’d like to pay" : "Pay with Mobile Money"}
          </h1>
          <p className="mt-4 text-lg text-[var(--muted)] max-w-2xl">
            {cardVisible
              ? "Pay with Ghana Mobile Money via Moolre, or with a bank card via Paystack. Funds stay protected until delivery is confirmed — same deal, whichever method you pick."
              : "Pay with Ghana Mobile Money via Moolre — MTN, Telecel, or AirtelTigo. Funds stay protected until delivery is confirmed."}
          </p>

          <Card className="mt-10 p-6 sm:p-8 max-w-xl">
            <p className="text-xs uppercase tracking-[0.14em] font-semibold text-[var(--muted)]">
              Order
            </p>
            <p className="font-display font-semibold text-lg mt-2">{txn.itemDescription}</p>
            <p className="mt-4 text-sm text-[var(--muted)]">
              Reference <span className="font-mono text-[var(--foreground)]">{txn.ref}</span>
            </p>
            <p className="mt-2 font-display text-3xl font-bold">{formatGhs(txn.totalCharged)}</p>
          </Card>

          <div className="mt-8">
            <CheckoutForm
              refCode={txn.ref}
              totalLabel={formatGhs(txn.totalCharged)}
              momoAvailable={momoAvailable}
              cardAvailable={cardAvailable}
              cardVisible={cardVisible}
            />
          </div>

          <p className="mt-10 text-xs text-[var(--muted)] max-w-xl leading-relaxed">
            You&rsquo;ll return here briefly after paying, then we&rsquo;ll confirm with your payment
            provider. If status doesn&rsquo;t update right away, refresh once — webhooks usually land
            within seconds.
          </p>
        </Container>
      </Section>
    </>
  );
}
