import Link from "next/link";
import { Container, Section } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Loader2 } from "lucide-react";
import { MarketingNav } from "@/components/marketing/nav";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import { isDbLive, isPaymentsLive } from "@/lib/env";
import { markPaidCore } from "@/lib/txn/mark-paid";
import { getChargeAdapterForTxn } from "@/lib/payments/charge-adapter";
import { stateLabel, type TxnState } from "@/lib/state/transaction";
import { StateBadge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/** Race a promise against a timeout so the page never blocks on Moolre. */
async function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[buy/return] ${label} deadline ${ms}ms exceeded`);
      resolve(null);
    }, ms);
  });
  try {
    const result = await Promise.race([p, timeout]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default async function ReturnPage({
  searchParams,
}: {
  searchParams: Promise<{
    ref?: string;
    reference?: string;
    trxref?: string;
    status?: string;
    stub?: string;
  }>;
}) {
  const sp = await searchParams;
  const ref = sp.ref || sp.reference || sp.trxref;
  let state: TxnState | null = null;
  let verified = false;

  if (ref && isDbLive) {
    const [t] = await getDb()
      .select()
      .from(transactions)
      .where(eq(transactions.ref, ref))
      .limit(1);

    if (sp.stub === "1" || !isPaymentsLive) {
      // Never settle for free in production. Stub path is local/dev only.
      if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
        console.warn(`[buy/return] ref=${ref} stub/no-PSP path blocked in production`);
      } else {
        console.log(`[buy/return] ref=${ref} stub path → markPaidCore`);
        await markPaidCore(ref);
      }
    } else if (t) {
      const chargePsp = await getChargeAdapterForTxn(t.id);
      const v = await withDeadline(
        chargePsp.verifyCharge(ref).catch((err: Error) => {
          console.error(`[buy/return] ref=${ref} verifyCharge threw:`, err.message);
          return null;
        }),
        6000,
        `verifyCharge(${ref})`,
      );
      console.log(
        `[buy/return] ref=${ref} via=${chargePsp.provider} verifyCharge=${v?.status ?? "timeout"}`,
      );
      if (v?.status === "succeeded") {
        const r = await markPaidCore(ref);
        console.log(
          `[buy/return] ref=${ref} markPaid ok=${r.ok} error=${"error" in r ? r.error : ""}`,
        );
      }
    }

    const [t2] = await getDb()
      .select()
      .from(transactions)
      .where(eq(transactions.ref, ref))
      .limit(1);
    if (t2) {
      state = t2.state as TxnState;
      verified =
        state === "paid" ||
        state === "dispatched" ||
        state === "delivered" ||
        state === "released" ||
        state === "completed" ||
        state === "payout_pending" ||
        state === "payout_approved";
    } else {
      console.warn(`[buy/return] ref=${ref} not found in transactions table`);
    }
  }

  return (
    <>
      <MarketingNav />
      <Section className="bg-paper min-h-[80vh]">
        <Container size="sm">
          <Card className="p-8 sm:p-10 text-center">
            {verified ? (
              <>
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)] mx-auto">
                  <ShieldCheck size={28} />
                </div>
                <h1 className="font-display text-3xl font-bold mt-5 tracking-tight">
                  Payment held safely.
                </h1>
                <p className="mt-3 text-[var(--muted)]">
                  Your payment is with our licensed partner (Moolre or Paystack). The seller has been
                  notified by SMS. We&rsquo;ll text you the moment it&rsquo;s dispatched.
                </p>
                <div className="mt-6 flex items-center justify-center gap-3">
                  {state && <StateBadge state={state} />}
                  <span className="font-mono text-sm text-[var(--muted)]">{ref}</span>
                </div>
                <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                  <Link href="/hub">
                    <Button>Open my Hub</Button>
                  </Link>
                  <Link href={`/track/${ref}`}>
                    <Button variant="secondary">Public tracking</Button>
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--muted)] mx-auto animate-pulse">
                  <Loader2 size={28} />
                </div>
                <h1 className="font-display text-3xl font-bold mt-5 tracking-tight">
                  Confirming payment&hellip;
                </h1>
                <p className="mt-3 text-[var(--muted)]">
                  {sp.status === "success"
                    ? "Your bank or wallet provider has confirmed the payment. We're finalising it on ours — this usually takes under a minute. Refresh this page in a moment, or jump to your Hub."
                    : "Your payment is being verified with your provider. This usually takes a few seconds. You can refresh, or check your Hub."}
                </p>
                <div className="mt-6 font-mono text-sm text-[var(--muted)]">{ref}</div>
                <div className="mt-8">
                  <Link href="/hub">
                    <Button>Go to Hub</Button>
                  </Link>
                </div>
              </>
            )}
          </Card>
          <p className="text-center text-xs text-[var(--muted)] mt-6">
            Status: {state ? stateLabel(state) : "Not found"}
          </p>
        </Container>
      </Section>
    </>
  );
}
