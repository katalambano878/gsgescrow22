import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { AppTopbar } from "@/components/app-shell/topbar";
import { Badge } from "@/components/ui/badge";
import { getSettings } from "@/lib/settings";
import { isAuthLive, isCardCheckoutEnabled, isDbLive, isEmailLive, isHubtelSmsLive, isMoolreLive, isMoolreSmsLive, isPaymentsLive, isPaystackLive, isSmsLive } from "@/lib/env";
import { CheckCircle2, XCircle, AlertTriangle, Zap } from "lucide-react";
import { formatGhs } from "@/lib/utils";
import { getPsp } from "@/lib/payments";
import { PspHealthCard } from "@/components/admin/psp-health-card";
import { ReconCard } from "@/components/admin/recon-card";
import { getLastReconReport } from "@/lib/recon/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Runbook" };

const PLAYBOOKS = [
  {
    title: "Payout stuck in processing",
    steps: [
      "Open /admin/payouts and filter to state = processing",
      "Check the PSP transfer reference on the detail page",
      "Trigger /api/cron/payout-sweep manually to reconcile with Moolre",
      "If still stuck, reject + create replacement with a fresh recipient code",
    ],
  },
  {
    title: "Dispute exceeded SLA",
    steps: [
      "Open /admin/disputes and sort by SLA due",
      "Review all evidence and confirm both parties have had a chance to respond",
      "Resolve with a documented reason — decision is audit-logged",
      "Refunds flow back to the buyer's original MoMo via Moolre's transfer API — threaded through dispute.resolveDispute",
    ],
  },
  {
    title: "Suspected fraud spike",
    steps: [
      "Open /admin/fraud and check the live alert feed",
      "Enable pause_payouts in platform settings if needed",
      "Raise high_value_alert_pesewas temporarily to tighten the net",
      "Review recent payouts from the flagged sellers; suspend if warranted",
    ],
  },
  {
    title: "Buyer can't see delivery code",
    steps: [
      "Ask buyer to open Hub → transaction → they'll see code only once on dispatch email/SMS",
      "If code needs re-issue, cancel dispatch state is not supported — contact seller and resend via SMS to buyer phone on file",
      "Never reveal the code to the seller through any channel — it's buyer-only by design",
    ],
  },
  {
    title: "New cap / fee roll-out",
    steps: [
      "Update values in /admin/settings — changes are audit-logged with your reason",
      "Verify by creating a test transaction with Moolre sandbox credentials",
      "Announce via the maintenance_banner setting (shows in marketing header)",
    ],
  },
];

export default async function RunbookPage() {
  const settings = await getSettings();
  const psp = getPsp();
  const lastRecon = getLastReconReport();
  const services = [
    {
      name: "Database",
      ok: isDbLive,
      note: isDbLive ? "Postgres via Supabase pooler" : "DATABASE_URL not set",
    },
    {
      name: "Auth",
      ok: isAuthLive,
      note: isAuthLive ? "Supabase Auth · phone OTP + password" : "Supabase env not set",
    },
    {
      name: "Payments",
      ok: isPaymentsLive,
      note: !isPaymentsLive
        ? "No PSP keys — using stub adapter"
        : [
            isMoolreLive ? "Moolre · Mobile Money checkout" : null,
            isPaystackLive
              ? isCardCheckoutEnabled
                ? "Paystack · Card checkout"
                : "Paystack configured · Card checkout DISABLED (CARD_PAYMENTS_ENABLED)"
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || "PSP",
    },
    {
      name: "SMS",
      ok: isSmsLive,
      note: !isSmsLive
        ? "No SMS provider keys — messages log to console"
        : isMoolreSmsLive
          ? `Moolre SMS primary${isHubtelSmsLive ? " · Hubtel failover" : ""}`
          : "Hubtel SMS",
    },
    {
      name: "Email",
      ok: isEmailLive,
      note: isEmailLive ? "Resend" : "RESEND_API_KEY not set",
    },
  ];

  return (
    <>
      <AppTopbar title="Ops runbook" subtitle="Operational playbooks, current config, and on-call reference" />
      <main className="flex-1">
        <Container size="wide" className="py-8 space-y-8">
          <Card className="p-6">
            <div className="flex items-center gap-2 text-[var(--primary)]">
              <Zap size={18} />
              <h2 className="font-display text-lg font-semibold">Service health</h2>
            </div>
            <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {services.map((s) => (
                <div key={s.name} className="rounded-md border border-[var(--border)] p-4 flex items-start gap-3">
                  {s.ok ? (
                    <CheckCircle2 size={18} className="text-[var(--primary)] mt-0.5 shrink-0" />
                  ) : (
                    <XCircle size={18} className="text-[var(--danger)] mt-0.5 shrink-0" />
                  )}
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-[var(--muted)] mt-0.5">{s.note}</p>
                    <Badge tone={s.ok ? "success" : "danger"} className="mt-2">
                      {s.ok ? "Connected" : "Not configured"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <PspHealthCard provider={psp.provider} />
          <ReconCard initial={lastRecon} />

          <Card className="p-6">
            <div className="flex items-center gap-2 text-[var(--primary)]">
              <AlertTriangle size={18} />
              <h2 className="font-display text-lg font-semibold">Effective configuration</h2>
            </div>
            <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
              <ConfigRow label="Buyer fee" value={`${(settings.buyer_fee_bps / 100).toFixed(2)}%`} />
              <ConfigRow label="Seller fee" value={`${(settings.seller_fee_bps / 100).toFixed(2)}%`} />
              <ConfigRow label="Rider release fee" value={formatGhs(settings.rider_release_fee_pesewas)} />
              <ConfigRow label="Seller release fee" value={formatGhs(settings.seller_release_fee_pesewas)} />
              <ConfigRow label="Transaction cap" value={formatGhs(settings.txn_cap_pesewas)} />
              <ConfigRow label="Auto-release window" value={`${settings.auto_release_hours}h`} />
              <ConfigRow label="Two-approver threshold" value={formatGhs(settings.two_approver_threshold_pesewas)} />
              <ConfigRow label="High-value alert" value={formatGhs(settings.high_value_alert_pesewas)} />
              <ConfigRow label="Dispute SLA" value={`${settings.dispute_sla_business_days} business days`} />
              <ConfigRow label="Pause new txns" value={settings.pause_new_transactions ? "ON" : "off"} danger={settings.pause_new_transactions} />
              <ConfigRow label="Pause payouts" value={settings.pause_payouts ? "ON" : "off"} danger={settings.pause_payouts} />
            </div>
            <Link href="/admin/settings" className="mt-4 inline-block text-sm font-semibold text-[var(--primary)] underline">
              Edit in settings →
            </Link>
          </Card>

          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold">Cron jobs</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <CronRow path="/api/cron/auto-release" schedule="*/15 * * * *" note="Sweeps dispatched transactions past their auto-release timer." />
              <CronRow path="/api/cron/payout-sweep" schedule="0 * * * *" note="Reconciles awaiting_payment + processing payouts against Moolre and finalizes completed transactions." />
              <CronRow path="/api/cron/daily-recon" schedule="0 6 * * *" note="Daily drift report at 06:00 GMT — emails any findings to RECON_REPORT_TO." />
            </ul>
          </Card>

          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold">Playbooks</h2>
            <div className="mt-4 space-y-5">
              {PLAYBOOKS.map((p) => (
                <div key={p.title} className="rounded-md border border-[var(--border)] p-4">
                  <h3 className="font-display font-semibold">{p.title}</h3>
                  <ol className="mt-3 space-y-2 text-sm list-decimal pl-4 marker:text-[var(--muted)]">
                    {p.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </Card>
        </Container>
      </main>
    </>
  );
}

function ConfigRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.14em] font-semibold text-[var(--muted)]">{label}</dt>
      <dd className={"mt-1 font-mono " + (danger ? "text-[var(--danger)] font-bold" : "")}>{value}</dd>
    </div>
  );
}

function CronRow({ path, schedule, note }: { path: string; schedule: string; note: string }) {
  return (
    <li className="flex items-start gap-3 rounded-md border border-[var(--border)] p-3">
      <span className="font-mono text-xs bg-[var(--surface-muted)] px-2 py-0.5 rounded shrink-0">{schedule}</span>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-sm">{path}</p>
        <p className="text-xs text-[var(--muted)] mt-0.5">{note}</p>
      </div>
    </li>
  );
}
