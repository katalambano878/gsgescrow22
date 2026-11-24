import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { StateBadge } from "@/components/ui/badge";
import { AppTopbar } from "@/components/app-shell/topbar";
import { Activity, Wallet, AlertTriangle, ShieldCheck, ArrowUpRight, Bell } from "lucide-react";
import { LiveTicker } from "@/components/admin/live-ticker";
import { AlertRow } from "@/components/admin/alert-row";
import { isDbLive } from "@/lib/env";
import { getDb } from "@/lib/db/client";
import { transactions, payouts, alerts, profiles } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";
import { formatGhs, relativeTime } from "@/lib/utils";
import type { TxnState } from "@/lib/state/transaction";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Control room" };

export default async function AdminDashboardPage() {
  const stats = {
    gmvProtected: 0,
    activeDeals: 0,
    pendingPayouts: 0,
    openDisputes: 0,
    sellersKycd: 0,
    healthScore: 100,
  };
  let recentTxns: { ref: string; state: TxnState; itemDescription: string; totalCharged: number; createdAt: Date }[] = [];
  let recentAlerts: { id: string; title: string; severity: string; kind: string; createdAt: Date; message: string | null; acknowledgedAt: Date | null }[] = [];

  if (isDbLive) {
    try {
      const db = getDb();
      const [s] = await db
        .select({
          gmv: sql<number>`coalesce(sum(${transactions.totalCharged}) filter (where ${transactions.state} in ('paid','dispatched','delivered','released','payout_pending','payout_approved','completed')), 0)::bigint`,
          active: sql<number>`count(*) filter (where ${transactions.state} in ('paid','dispatched','delivered','released','payout_pending','payout_approved'))::int`,
          disputed: sql<number>`count(*) filter (where ${transactions.state} = 'disputed')::int`,
        })
        .from(transactions);
      const [p] = await db
        .select({ pending: sql<number>`count(*) filter (where ${payouts.state} = 'pending_approval')::int` })
        .from(payouts);
      const [k] = await db
        .select({ count: sql<number>`count(*) filter (where ${profiles.kycStatus} = 'approved')::int` })
        .from(profiles);
      stats.gmvProtected = Number(s?.gmv ?? 0);
      stats.activeDeals = Number(s?.active ?? 0);
      stats.openDisputes = Number(s?.disputed ?? 0);
      stats.pendingPayouts = Number(p?.pending ?? 0);
      stats.sellersKycd = Number(k?.count ?? 0);

      stats.healthScore = Math.max(
        40,
        100 - Math.min(40, stats.openDisputes * 4) - Math.min(20, Math.max(0, stats.pendingPayouts - 10) * 2),
      );

      const txns = await db
        .select()
        .from(transactions)
        .orderBy(desc(transactions.createdAt))
        .limit(8);
      recentTxns = txns.map((t) => ({
        ref: t.ref,
        state: t.state as TxnState,
        itemDescription: t.itemDescription,
        totalCharged: t.totalCharged,
        createdAt: t.createdAt,
      }));

      const alertsData = await db
        .select()
        .from(alerts)
        .orderBy(desc(alerts.createdAt))
        .limit(8);
      recentAlerts = alertsData.map((a) => ({
        id: a.id,
        title: a.title,
        severity: a.severity,
        kind: a.kind,
        createdAt: a.createdAt,
        message: a.message,
        acknowledgedAt: a.acknowledgedAt,
      }));
    } catch {}
  }

  return (
    <>
      <AppTopbar
        title="Control room"
        subtitle="Live operations across SBBS — money, disputes, KYC."
        actions={<LiveTicker />}
      />
      <main className="flex-1">
        <Container size="wide" className="py-8 space-y-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="Total protected GMV" value={formatGhs(stats.gmvProtected)} icon={Wallet} tone="accent" />
            <Kpi label="Active deals" value={stats.activeDeals.toLocaleString()} icon={Activity} tone="info" />
            <Kpi label="Pending payouts" value={stats.pendingPayouts.toLocaleString()} icon={Wallet} tone="warning" linkHref="/admin/payouts/approvals" />
            <Kpi label="Open disputes" value={stats.openDisputes.toLocaleString()} icon={AlertTriangle} tone={stats.openDisputes > 0 ? "danger" : "success"} linkHref="/admin/disputes" />
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <div className="p-5 sm:p-6 flex items-center justify-between gap-3 border-b border-[var(--border)]">
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-semibold">Recent transactions</h2>
                  <p className="text-sm text-[var(--muted)] mt-0.5 hidden sm:block">Latest 8 across the platform.</p>
                </div>
                <Link href="/admin/transactions" className="shrink-0 text-sm text-[var(--primary)] font-medium inline-flex items-center gap-1">
                  See all <ArrowUpRight size={14} />
                </Link>
              </div>
              <ul className="divide-y divide-[var(--border)]">
                {recentTxns.length === 0 && (
                  <li className="px-5 sm:px-6 py-8 text-center text-sm text-[var(--muted)]">No transactions yet</li>
                )}
                {recentTxns.map((t) => (
                  <li key={t.ref}>
                    <Link
                      href={`/admin/transactions/${t.ref}`}
                      className="block sm:grid sm:grid-cols-12 sm:items-center sm:gap-4 px-5 sm:px-6 py-3.5 hover:bg-[var(--surface-muted)]/50"
                    >
                      <div className="sm:col-span-5 min-w-0">
                        <p className="font-medium truncate">{t.itemDescription}</p>
                        <p className="text-xs text-[var(--muted)] mt-0.5 font-mono truncate">{t.ref}</p>
                      </div>
                      <div className="mt-2 sm:mt-0 sm:col-span-3 text-sm font-semibold flex items-center justify-between sm:block gap-3">
                        <span>{formatGhs(t.totalCharged)}</span>
                        <span className="sm:hidden text-xs font-normal text-[var(--muted)]">{relativeTime(t.createdAt)}</span>
                      </div>
                      <div className="mt-2 sm:mt-0 sm:col-span-2"><StateBadge state={t.state} /></div>
                      <div className="hidden sm:block sm:col-span-2 text-xs text-[var(--muted)] text-right">{relativeTime(t.createdAt)}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>

            <div className="space-y-4">
              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] font-semibold text-[var(--muted)]">Health score</p>
                    <p className="font-display text-4xl font-bold mt-2">{stats.healthScore}</p>
                  </div>
                  <ShieldCheck size={32} className={stats.healthScore > 80 ? "text-[var(--primary)]" : "text-[var(--warning)]"} />
                </div>
                <div className="mt-3 h-2 rounded-full bg-[var(--surface-muted)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--primary)]"
                    style={{ width: `${stats.healthScore}%` }}
                  />
                </div>
                <p className="text-xs text-[var(--muted)] mt-3">
                  Composite of payout backlog and dispute volume. 100 is healthy.
                </p>
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display font-semibold flex items-center gap-2">
                    <Bell size={16} /> Alerts
                  </h3>
                  <Link href="/admin/fraud" className="text-xs text-[var(--primary)] font-medium">View all</Link>
                </div>
                {recentAlerts.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">All quiet.</p>
                ) : (
                  <div className="space-y-2">
                    {recentAlerts.slice(0, 4).map((a) => (
                      <AlertRow key={a.id} {...a} />
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </Container>
      </main>
    </>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
  linkHref,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: "info" | "success" | "warning" | "accent" | "danger";
  linkHref?: string;
}) {
  const t = {
    info: "bg-[#e8f1f8] text-[#1f4a72]",
    success: "bg-[var(--primary-soft)] text-[var(--primary)]",
    warning: "bg-[#fbf2dd] text-[#7a5410]",
    accent: "bg-[var(--accent-soft)] text-[var(--accent-foreground)]",
    danger: "bg-[#fbe5e3] text-[var(--danger)]",
  } as const;
  const inner = (
    <Card className="p-5 hover:shadow-[var(--shadow-pop)] transition-shadow">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.14em] font-semibold text-[var(--muted)]">{label}</p>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${t[tone]}`}>
          <Icon size={16} />
        </span>
      </div>
      <p className="font-display text-3xl font-bold mt-3">{value}</p>
    </Card>
  );
  return linkHref ? <Link href={linkHref}>{inner}</Link> : inner;
}
