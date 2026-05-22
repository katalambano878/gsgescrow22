import Link from "next/link";
import { Container, Section, Eyebrow } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { StateBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isDbLive } from "@/lib/env";
import { redactPhone, formatGhs, relativeTime } from "@/lib/utils";
import { stateLabel, type TxnState } from "@/lib/state/transaction";
import { RiderConfirmCard } from "@/components/track/rider-confirm-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Track" };

export default async function TrackByRefPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const decodedRef = decodeURIComponent(ref).toUpperCase();

  let txn = null as null | {
    ref: string;
    state: TxnState;
    buyerPhone: string;
    sellerPhone: string;
    sellerName: string;
    buyerName: string;
    itemDescription: string;
    deliveryCity: string;
    totalCharged: number;
    createdAt: Date;
  };

  if (isDbLive) {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(transactions)
        .where(eq(transactions.ref, decodedRef))
        .limit(1);
      const row = rows[0];
      if (row) {
        txn = {
          ref: row.ref,
          state: row.state as TxnState,
          buyerPhone: row.buyerPhone,
          sellerPhone: row.sellerPhone,
          sellerName: row.sellerName,
          buyerName: row.buyerName,
          itemDescription: row.itemDescription,
          deliveryCity: row.deliveryCity,
          totalCharged: row.totalCharged,
          createdAt: row.createdAt,
        };
      }
    } catch {
      txn = null;
    }
  }

  return (
    <Section className="bg-paper min-h-[80vh]">
      <Container size="sm">
        <Link
          href="/track"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <ArrowLeft size={14} /> Look up another
        </Link>
        <Eyebrow className="mt-6">Public tracking</Eyebrow>

        {txn ? (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3 mt-4">
              <h1 className="font-mono text-2xl sm:text-3xl font-bold">
                {txn.ref}
              </h1>
              <StateBadge state={txn.state} />
            </div>
            <Card className="mt-6 divide-y divide-[var(--border)]">
              <Row label="Item" value={txn.itemDescription} />
              <Row label="Delivery city" value={txn.deliveryCity} />
              <Row
                label="Buyer"
                value={`${initials(txn.buyerName)} · ${redactPhone(txn.buyerPhone)}`}
              />
              <Row
                label="Seller"
                value={`${txn.sellerName.split(" ")[0]} · ${redactPhone(txn.sellerPhone)}`}
              />
              <Row
                label="Total"
                value={formatGhs(txn.totalCharged)}
              />
              <Row label="Created" value={relativeTime(txn.createdAt)} />
              <Row label="Status" value={stateLabel(txn.state)} />
            </Card>
            {(txn.state === "dispatched" || txn.state === "delivered") && (
              <RiderConfirmCard txnRef={txn.ref} />
            )}

            <div className="mt-6 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] p-4 flex items-start gap-3">
              <ShieldCheck size={18} className="text-[var(--primary)] mt-0.5 shrink-0" />
              <p className="text-sm text-[var(--muted)] leading-relaxed">
                For privacy, full names and phone numbers are hidden on the
                public tracking page. The buyer and seller see complete details
                from their <Link href="/hub" className="text-[var(--primary)] underline">Hub</Link>.
              </p>
            </div>
          </>
        ) : (
          <Card className="mt-8 p-8 text-center">
            <h2 className="font-display text-xl font-semibold">
              No order found
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              We couldn&rsquo;t find an order with reference{" "}
              <span className="font-mono">{decodedRef}</span>. Check the
              spelling and try again.
            </p>
            <div className="mt-6">
              <Link href="/track">
                <Button variant="secondary">Try another reference</Button>
              </Link>
            </div>
          </Card>
        )}
      </Container>
    </Section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-3.5 flex items-center justify-between gap-4">
      <span className="text-xs uppercase tracking-[0.14em] font-semibold text-[var(--muted)]">
        {label}
      </span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}
