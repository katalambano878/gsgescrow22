import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, Receipt } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StateBadge } from "@/components/ui/badge";
import { AppTopbar } from "@/components/app-shell/topbar";
import { isDbLive } from "@/lib/env";
import { getDb } from "@/lib/db/client";
import { transactions, transactionEvents, payouts, disputes } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth/session";
import { formatGhs, relativeTime } from "@/lib/utils";
import type { TxnState } from "@/lib/state/transaction";
import { channelLabel, type PayoutChannel } from "@/lib/payments/defaults";
import { TxnActions } from "@/components/hub/txn-actions";
import { TxnProgress } from "@/components/hub/txn-progress";
import { ReviewForm } from "@/components/hub/review-form";
import { EvidenceUploader } from "@/components/hub/evidence-uploader";

export const dynamic = "force-dynamic";

export default async function TxnDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  if (!isDbLive) return notFound();
  const db = getDb();
  const [txn] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.ref, ref))
    .limit(1);
  if (!txn) return notFound();

  const user = await getSessionUser();
  const role: "buyer" | "seller" | "guest" =
    user?.id === txn.buyerId ? "buyer" : user?.id === txn.sellerId ? "seller" : "guest";

  const events = await db
    .select()
    .from(transactionEvents)
    .where(eq(transactionEvents.transactionId, txn.id))
    .orderBy(desc(transactionEvents.createdAt))
    .limit(20);

  const payoutRows = await db
    .select()
    .from(payouts)
    .where(eq(payouts.transactionId, txn.id));
  const payout = payoutRows[0];
  const meta = (txn.metadata ?? {}) as {
    orderType?: string;
    riderPayoutChannel?: PayoutChannel;
    sellerPayoutChannel?: PayoutChannel;
  };
  const orderType =
    meta.orderType === "service" ? ("service" as const) : ("product" as const);
  const riderChannel: PayoutChannel = meta.riderPayoutChannel ?? "momo";
  const sellerChannel: PayoutChannel = meta.sellerPayoutChannel ?? "momo";

  const [dispute] = await db
    .select()
    .from(disputes)
    .where(eq(disputes.transactionId, txn.id))
    .orderBy(desc(disputes.createdAt))
    .limit(1);

  return (
    <>
      <AppTopbar
        title={txn.itemDescription}
        subtitle={`${ref} · created ${relativeTime(txn.createdAt)}`}
        actions={<StateBadge state={txn.state as TxnState} />}
      />
      <main className="flex-1">
        <Container size="wide" className="py-8 grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Link
              href="/hub/transactions"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <ArrowLeft size={14} /> All transactions
            </Link>

            <TxnProgress
              txnRef={ref}
              state={txn.state as TxnState}
              orderType={orderType}
              role={role}
              createdAt={txn.createdAt}
              paidAt={txn.paidAt}
              dispatchedAt={txn.dispatchedAt}
              deliveredAt={txn.deliveredAt}
              releasedAt={txn.releasedAt}
              completedAt={txn.completedAt}
              cancelledAt={txn.cancelledAt}
              riderPayoutAmount={txn.riderPayoutAmount}
              sellerPayoutAmount={txn.sellerPayoutAmount}
              payouts={payoutRows.map((p) => ({
                kind: p.kind as "rider" | "seller",
                state: p.state,
                paidAt: p.paidAt,
                amount: p.amount,
              }))}
            />

            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold">Order details</h2>
              <dl className="mt-5 grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Field
                  label="Type"
                  value={
                    (txn.metadata as { orderType?: string } | null)?.orderType === "service"
                      ? "Service"
                      : "Product"
                  }
                />
                <Field
                  label={
                    (txn.metadata as { orderType?: string } | null)?.orderType === "service"
                      ? "Service"
                      : "Item"
                  }
                  value={txn.itemDescription}
                />
                {txn.itemLink && (
                  <Field
                    label="Link"
                    value={
                      <a className="text-[var(--primary)] underline truncate inline-block max-w-full" href={txn.itemLink} target="_blank" rel="noreferrer">
                        {txn.itemLink}
                      </a>
                    }
                  />
                )}
                <Field label="Buyer" value={`${txn.buyerName} · ${txn.buyerPhone}`} />
                <Field label="Seller" value={`${txn.sellerName} · ${txn.sellerPhone}`} />
                <Field
                  label={
                    (txn.metadata as { orderType?: string } | null)?.orderType === "service"
                      ? "Service location"
                      : "Delivery to"
                  }
                  value={`${txn.deliveryAddress}, ${txn.deliveryCity}`}
                />
                <Field label="Initiated by" value={txn.initiatedBy} />
              </dl>
            </Card>

            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold">Money</h2>
              <div className="mt-5 grid sm:grid-cols-2 gap-4">
                <Money
                  label={
                    (txn.metadata as { orderType?: string } | null)?.orderType === "service"
                      ? "Service"
                      : "Product"
                  }
                  value={txn.productAmount}
                />
                <Money
                  label={
                    (txn.metadata as { orderType?: string } | null)?.orderType === "service"
                      ? "Travel / call-out"
                      : "Delivery"
                  }
                  value={txn.deliveryAmount}
                />
                <Money label="Buyer fee" value={txn.buyerFee} />
                <Money
                  label={`Rider release · ${channelLabel(riderChannel)}`}
                  value={txn.riderReleaseFee}
                />
                <Money
                  label={`Seller release · ${channelLabel(sellerChannel)}`}
                  value={txn.sellerReleaseFee}
                />
                <Money label="Seller payout" value={txn.sellerPayoutAmount} accent />
                <Money label="Total charged" value={txn.totalCharged} bold />
              </div>
              <p className="mt-3 text-xs text-[var(--muted)]">
                Rider release is paid by the buyer. Seller release is deducted from the seller&rsquo;s payout.
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold">Timeline</h2>
              <ol className="mt-5 space-y-3">
                {events.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 text-sm">
                    <span className="mt-1 inline-block h-2 w-2 rounded-full bg-[var(--primary)] shrink-0" />
                    <div className="flex-1">
                      <p>
                        <span className="font-medium capitalize">{e.toState.replace("_", " ")}</span>
                        {e.note && <span className="text-[var(--muted)]"> — {e.note}</span>}
                      </p>
                      <p className="text-xs text-[var(--muted)] mt-0.5">{relativeTime(e.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>

            {payout && (
              <Card className="p-6">
                <h2 className="font-display text-lg font-semibold">Payout</h2>
                <div className="mt-5 grid sm:grid-cols-2 gap-4">
                  <Field label="To" value={`${payout.payeeName} · ${payout.payeePhone}`} />
                  <Field label="Amount" value={formatGhs(payout.amount)} />
                  <Field label="State" value={<Badge tone={payout.state === "paid" ? "success" : payout.state === "rejected" ? "danger" : "info"}>{payout.state}</Badge>} />
                  {payout.pspTransferRef && (
                    <Field label="PSP ref" value={<span className="font-mono text-xs">{payout.pspTransferRef}</span>} />
                  )}
                </div>
              </Card>
            )}
          </div>

          <aside className="space-y-4">
            <TxnActions
              txnRef={ref}
              role={role}
              state={txn.state as TxnState}
              hasOpenDispute={Boolean(dispute && dispute.state === "open")}
            />

            {txn.state === "completed" && role !== "guest" && (
              <ReviewForm txnRef={ref} />
            )}

            {dispute && dispute.state === "open" && role !== "guest" && (
              <Card className="p-5">
                <h3 className="font-display font-semibold">Upload evidence</h3>
                <p className="text-sm text-[var(--muted)] mt-1">
                  Add chat screenshots, tracking photos, or dispatch slips. Only SBBS reviewers and the other party can see them.
                </p>
                <div className="mt-4">
                  <EvidenceUploader disputeId={dispute.id} />
                </div>
              </Card>
            )}

            <Card className="p-5">
              <h3 className="font-display font-semibold">Receipts & evidence</h3>
              <div className="mt-4 space-y-2">
                <Link href={`/api/receipt/${ref}`} target="_blank">
                  <Button variant="secondary" className="w-full" size="sm">
                    <Receipt size={14} /> Download PDF receipt
                  </Button>
                </Link>
                <Link href={`/track/${ref}`}>
                  <Button variant="ghost" className="w-full" size="sm">
                    Public tracking link
                  </Button>
                </Link>
              </div>
            </Card>

            <Card className="p-5">
              <ShieldCheck size={18} className="text-[var(--primary)]" />
              <p className="text-sm mt-2 text-[var(--muted)] leading-relaxed">
                If anything is wrong, open a dispute. The transaction freezes
                and a real human at SBBS reviews within 5 business days.
              </p>
            </Card>
          </aside>
        </Container>
      </main>
    </>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.14em] font-semibold text-[var(--muted)]">
        {label}
      </dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}

function Money({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: number;
  bold?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "rounded-[var(--radius-md)] border p-3 " +
        (accent
          ? "border-[var(--primary)]/30 bg-[var(--primary-soft)]"
          : "border-[var(--border)]")
      }
    >
      <p className="text-xs uppercase tracking-[0.14em] font-semibold text-[var(--muted)]">
        {label}
      </p>
      <p className={"mt-1 " + (bold ? "font-display text-xl font-bold" : "font-semibold")}>
        {formatGhs(value)}
      </p>
    </div>
  );
}
