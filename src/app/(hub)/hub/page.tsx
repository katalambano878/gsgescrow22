import Link from "next/link";
import { ArrowRight, ShieldCheck, Wallet, Truck, Star } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StateBadge } from "@/components/ui/badge";
import { AppTopbar } from "@/components/app-shell/topbar";
import { isAuthLive, isDbLive } from "@/lib/env";
import { getSessionUser, getCurrentProfile } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import { desc, eq, or, sql } from "drizzle-orm";
import { formatGhs } from "@/lib/utils";
import type { TxnState } from "@/lib/state/transaction";
import { OnboardingChecklist } from "@/components/hub/onboarding-checklist";
import { ActivityFeed } from "@/components/hub/activity-feed";

export const dynamic = "force-dynamic";

export default async function HubDashboardPage() {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();

  const stats = { active: 0, completed: 0, disputed: 0, totalProtected: 0 };
  let recent: { ref: string; state: TxnState; itemDescription: string; totalCharged: number; createdAt: Date; counterparty: string }[] = [];

  if (isDbLive && user) {
    const db = getDb();
    const where = or(eq(transactions.buyerId, user.id), eq(transactions.sellerId, user.id));
    const [s] = await db
      .select({
        active: sql<number>`count(*) filter (where ${transactions.state} in ('paid','dispatched','delivered','released','payout_pending','payout_approved'))::int`,
        completed: sql<number>`count(*) filter (where ${transactions.state} = 'completed')::int`,
        disputed: sql<number>`count(*) filter (where ${transactions.state} = 'disputed')::int`,
        protected: sql<number>`coalesce(sum(${transactions.totalCharged}) filter (where ${transactions.state} in ('paid','dispatched','delivered','released','payout_pending','payout_approved','completed')), 0)::bigint`,
      })
      .from(transactions)
      .where(where);
    stats.active = Number(s?.active ?? 0);
    stats.completed = Number(s?.completed ?? 0);
    stats.disputed = Number(s?.disputed ?? 0);
    stats.totalProtected = Number(s?.protected ?? 0);

    const rows = await db
      .select()
      .from(transactions)
      .where(where)
      .orderBy(desc(transactions.createdAt))
      .limit(5);
    recent = rows.map((r) => ({
      ref: r.ref,
      state: r.state as TxnState,
      itemDescription: r.itemDescription,
      totalCharged: r.totalCharged,
      createdAt: r.createdAt,
      counterparty: r.buyerId === user.id ? r.sellerName : r.buyerName,
    }));
  }

  const greeting = profile?.displayName ?? user?.email?.split("@")[0] ?? "there";

  return (
    <>
      <AppTopbar
        title={`Hi ${greeting}.`}
        subtitle="Every protected deal you're a buyer or seller in, in one place."
        actions={
          <>
            <Link href="/buy">
              <Button>Start a purchase</Button>
            </Link>
            <Link href="/sell">
              <Button variant="secondary">Send a payment link</Button>
            </Link>
          </>
        }
      />
      <main className="flex-1">
        <Container size="wide" className="py-8 space-y-8">
          {!isAuthLive && (
            <Card className="p-5 border-[#ecdba8] bg-[#fbf2dd]">
              <p className="text-sm text-[#7a5410]">
                Auth and database aren&rsquo;t configured. This is a preview of the Hub.
                Set DATABASE_URL and AUTH_SECRET to enable real sign-in and persistence.
              </p>
            </Card>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Active deals" value={stats.active.toString()} icon={Truck} tone="info" />
            <KpiCard label="Completed" value={stats.completed.toString()} icon={Star} tone="success" />
            <KpiCard label="Disputed" value={stats.disputed.toString()} icon={ShieldCheck} tone={stats.disputed > 0 ? "warning" : "neutral"} />
            <KpiCard label="Total protected" value={formatGhs(stats.totalProtected)} icon={Wallet} tone="accent" />
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <div className="p-5 sm:p-6 flex items-center justify-between gap-3 border-b border-[var(--border)]">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-semibold">Recent transactions</h2>
                    <p className="text-sm text-[var(--muted)] mt-0.5 hidden sm:block">
                      Tap a row to confirm delivery, open a dispute, or download a receipt.
                    </p>
                  </div>
                  <Link href="/hub/transactions" className="shrink-0 text-sm text-[var(--primary)] font-medium inline-flex items-center gap-1">
                    See all <ArrowRight size={14} />
                  </Link>
                </div>
                {recent.length === 0 ? (
                  <EmptyState />
                ) : (
                  <ul className="divide-y divide-[var(--border)]">
                    {recent.map((r) => (
                      <li key={r.ref}>
                        <Link
                          href={`/hub/transactions/${r.ref}`}
                          className="block sm:grid sm:grid-cols-12 sm:items-center sm:gap-4 px-5 sm:px-6 py-4 hover:bg-[var(--surface-muted)]/50 transition-colors"
                        >
                          <div className="sm:col-span-5 min-w-0">
                            <p className="font-medium truncate">{r.itemDescription}</p>
                            <p className="text-xs text-[var(--muted)] mt-0.5 font-mono truncate">
                              {r.ref}
                            </p>
                          </div>
                          <div className="mt-1 sm:mt-0 sm:col-span-3 text-sm text-[var(--muted)] truncate">
                            with {r.counterparty}
                          </div>
                          <div className="mt-2 sm:mt-0 sm:col-span-2 text-sm font-semibold flex items-center justify-between gap-3 sm:block">
                            <span>{formatGhs(r.totalCharged)}</span>
                            <span className="sm:hidden"><StateBadge state={r.state} /></span>
                          </div>
                          <div className="hidden sm:flex sm:col-span-2 justify-end">
                            <StateBadge state={r.state} />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {user && <ActivityFeed userId={user.id} />}
            </div>

            <aside className="space-y-6">
              <OnboardingChecklist
                profile={profile}
                hasActiveDeal={stats.active > 0}
                hasCompletedDeal={stats.completed > 0}
              />
            </aside>
          </div>
        </Container>
      </main>
    </>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: "neutral" | "info" | "success" | "warning" | "accent";
}) {
  const toneClasses = {
    neutral: "bg-[var(--surface-muted)] text-[var(--muted)]",
    info: "bg-[#e8f1f8] text-[#1f4a72]",
    success: "bg-[var(--primary-soft)] text-[var(--primary)]",
    warning: "bg-[#fbf2dd] text-[#7a5410]",
    accent: "bg-[var(--accent-soft)] text-[var(--accent-foreground)]",
  } as const;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.14em] font-semibold text-[var(--muted)]">
          {label}
        </p>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${toneClasses[tone]}`}>
          <Icon size={16} />
        </span>
      </div>
      <p className="font-display text-3xl font-bold mt-3">{value}</p>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="px-6 py-14 text-center">
      <Badge tone="neutral">No transactions yet</Badge>
      <h3 className="font-display text-xl font-semibold mt-4">Your first protected deal awaits</h3>
      <p className="mt-2 text-sm text-[var(--muted)] max-w-md mx-auto">
        Either start a protected purchase from a seller in your DMs, or send a payment link to a buyer.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/buy"><Button>Start a purchase</Button></Link>
        <Link href="/sell"><Button variant="secondary">Send a payment link</Button></Link>
      </div>
    </div>
  );
}
