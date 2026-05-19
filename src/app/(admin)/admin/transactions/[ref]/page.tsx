import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { StateBadge } from "@/components/ui/badge";
import { AppTopbar } from "@/components/app-shell/topbar";
import { isDbLive } from "@/lib/env";
import { getDb } from "@/lib/db/client";
import { transactions, transactionEvents, payouts, disputes, payments } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { formatGhs, relativeTime } from "@/lib/utils";
import type { TxnState } from "@/lib/state/transaction";
import { PspPanel } from "@/components/admin/psp-panel";
import { getPsp } from "@/lib/payments";
import { getCurrentProfile } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminTxnDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  if (!isDbLive) return notFound();
  const db = getDb();
  const [txn] = await db.select().from(transactions).where(eq(transactions.ref, ref)).limit(1);
  if (!txn) return notFound();

  let isSuperadmin = false;
  try {
    const actor = await getCurrentProfile();
    isSuperadmin = actor?.role === "superadmin";
  } catch (err) {
    console.error(`[admin/txn] getCurrentProfile failed for ref=${ref}:`, (err as Error).message);
  }

  const events = await db
    .select()
    .from(transactionEvents)
    .where(eq(transactionEvents.transactionId, txn.id))
    .orderBy(desc(transactionEvents.createdAt))
    .limit(40)
    .catch((err) => {
      console.error(`[admin/txn] events query failed:`, err);
      return [];
    });

  const [payout] = await db
    .select()
    .from(payouts)
    .where(eq(payouts.transactionId, txn.id))
    .limit(1)
    .catch(() => [] as typeof payouts.$inferSelect[]);
  const [pay] = await db
    .select()
    .from(payments)
    .where(eq(payments.transactionId, txn.id))
    .limit(1)
    .catch(() => [] as typeof payments.$inferSelect[]);
  const [dispute] = await db
    .select()
    .from(disputes)
    .where(eq(disputes.transactionId, txn.id))
    .limit(1)
    .catch(() => [] as typeof disputes.$inferSelect[]);

  return (
    <>
      <AppTopbar
        title={`${ref}`}
        subtitle={txn.itemDescription}
        actions={<StateBadge state={txn.state as TxnState} />}
      />
      <main className="flex-1">
        <Container size="wide" className="py-8 grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Link href="/admin/transactions" className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
              <ArrowLeft size={14} /> All transactions
            </Link>

            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold">Parties</h2>
              <dl className="mt-5 grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Field
                  label="Type"
                  value={
                    (txn.metadata as { orderType?: string } | null)?.orderType === "service"
                      ? "Service"
                      : "Product"
                  }
                />
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
              <h2 className="font-display text-lg font-semibold">Money breakdown</h2>
              <dl className="mt-5 grid sm:grid-cols-3 gap-3 text-sm">
                <Money label="Product" v={txn.productAmount} />
                <Money label="Delivery" v={txn.deliveryAmount} />
                <Money label="Buyer fee" v={txn.buyerFee} />
                <Money label="Seller fee" v={txn.sellerFee} />
                <Money label="Rider release fee" v={txn.riderReleaseFee} />
                <Money label="Seller release fee" v={txn.sellerReleaseFee} />
                <Money label="PSP fee" v={txn.pspFee} />
                <Money label="Total charged" v={txn.totalCharged} bold />
                <Money label="Seller payout" v={txn.sellerPayoutAmount} accent />
                <Money label="Rider payout" v={txn.riderPayoutAmount} />
              </dl>
            </Card>

            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold">Lifecycle</h2>
              <ol className="mt-5 space-y-3">
                {events.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 text-sm">
                    <span className="mt-1 inline-block h-2 w-2 rounded-full bg-[var(--primary)] shrink-0" />
                    <div className="flex-1">
                      <p>
                        {e.fromState} <span className="text-[var(--muted)]">→</span>{" "}
                        <span className="font-medium">{e.toState}</span>
                        {e.note && <span className="text-[var(--muted)]"> · {e.note}</span>}
                      </p>
                      <p className="text-xs text-[var(--muted)] mt-0.5">
                        {relativeTime(e.createdAt)}
                        {e.actorRole && <span> · {e.actorRole}</span>}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          <aside className="space-y-4">
            {(() => {
              const psp = getPsp();
              const paymentDashboardUrl =
                pay?.pspReference && typeof psp.dashboardUrl === "function"
                  ? psp.dashboardUrl({ kind: "charge", pspRef: pay.pspReference })
                  : null;
              const payoutDashboardUrl =
                payout?.pspTransferRef && typeof psp.dashboardUrl === "function"
                  ? psp.dashboardUrl({ kind: "transfer", pspRef: payout.pspTransferRef })
                  : null;
              return (
                <PspPanel
                  provider={psp.provider}
                  txnRef={txn.ref}
                  paymentPspRef={pay?.pspReference ?? null}
                  paymentAuthorizationUrl={pay?.authorizationUrl ?? null}
                  paymentState={pay?.state ?? null}
                  payout={
                    payout
                      ? {
                          id: payout.id,
                          state: payout.state,
                          transferRef: payout.pspTransferRef ?? null,
                        }
                      : null
                  }
                  paymentDashboardUrl={paymentDashboardUrl}
                  payoutDashboardUrl={payoutDashboardUrl}
                  currentState={txn.state}
                  isSuperadmin={isSuperadmin}
                />
              );
            })()}

            {payout && (
              <Card className="p-5">
                <h3 className="font-display font-semibold">Payout</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <Field label="State" value={payout.state} />
                  <Field label="Amount" value={formatGhs(payout.amount)} />
                  <Field label="To" value={`${payout.payeeName} · ${payout.payeePhone}`} />
                  {payout.riskFlags && payout.riskFlags.length > 0 && (
                    <Field
                      label="Risk flags"
                      value={<span className="text-xs text-[var(--danger)]">{payout.riskFlags.join(", ")}</span>}
                    />
                  )}
                </dl>
              </Card>
            )}
            {dispute && (
              <Card className="p-5">
                <h3 className="font-display font-semibold">Dispute</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <Field label="State" value={dispute.state} />
                  <Field label="Reason" value={dispute.reason} />
                  {dispute.description && <Field label="Detail" value={dispute.description} />}
                </dl>
              </Card>
            )}
          </aside>
        </Container>
      </main>
    </>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.14em] font-semibold text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}

function Money({
  label,
  v,
  bold,
  accent,
}: {
  label: string;
  v: number;
  bold?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={"rounded-md border p-3 " + (accent ? "border-[var(--primary)]/30 bg-[var(--primary-soft)]" : "border-[var(--border)]")}>
      <p className="text-xs uppercase tracking-[0.14em] font-semibold text-[var(--muted)]">{label}</p>
      <p className={"mt-1 " + (bold ? "font-display text-lg font-bold" : "font-semibold")}>{formatGhs(v)}</p>
    </div>
  );
}
