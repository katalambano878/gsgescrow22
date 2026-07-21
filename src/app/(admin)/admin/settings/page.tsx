import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { AppTopbar } from "@/components/app-shell/topbar";
import { getSettings, describeSetting, type PlatformConfig } from "@/lib/settings";
import { SettingsForm } from "@/components/admin/settings-form";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Platform Settings" };

const GROUPS: Array<{ title: string; keys: (keyof PlatformConfig)[]; description: string }> = [
  {
    title: "Economics",
    description:
      "Platform fees plus channel-aware release fees (MoMo % + cap, Bank flat).",
    keys: [
      "buyer_fee_bps",
      "seller_fee_bps",
      "rider_release_momo_bps",
      "rider_release_momo_cap_pesewas",
      "rider_release_bank_pesewas",
      "seller_release_momo_bps",
      "seller_release_momo_cap_pesewas",
      "seller_release_bank_pesewas",
    ],
  },
  {
    title: "Operations",
    description: "Caps, release windows, global toggles.",
    keys: [
      "txn_cap_pesewas",
      "auto_release_hours",
      "dispute_sla_business_days",
      "payout_max_retries",
      "pause_new_transactions",
      "pause_payouts",
      "maintenance_banner",
      "bootstrap_admin_emails",
    ],
  },
  {
    title: "Risk",
    description: "Thresholds that control the fraud rules engine and approver policy.",
    keys: [
      "two_approver_threshold_pesewas",
      "high_value_alert_pesewas",
      "new_seller_days_threshold",
      "new_seller_max_payout_pesewas",
    ],
  },
  {
    title: "Commercial",
    description: "Future revenue plumbing.",
    keys: ["marketplace_listing_fee_pesewas", "trust_badge_premium_monthly_pesewas"],
  },
];

export default async function AdminSettingsPage() {
  const settings = await getSettings();
  return (
    <>
      <AppTopbar title="Platform Settings" subtitle="Caps, fees, risk thresholds, feature flags" />
      <main className="flex-1">
        <Container size="wide" className="py-8 space-y-8">
          {GROUPS.map((g) => (
            <Card key={g.title} className="p-6 sm:p-8">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <h2 className="font-display text-lg font-semibold">{g.title}</h2>
                  <p className="text-sm text-[var(--muted)] mt-1">{g.description}</p>
                </div>
              </div>
              <SettingsForm
                keys={g.keys}
                initial={g.keys.reduce<Record<string, unknown>>((acc, k) => {
                  acc[k] = settings[k];
                  return acc;
                }, {})}
                meta={g.keys.reduce<Record<string, ReturnType<typeof describeSetting>>>((acc, k) => {
                  acc[k] = describeSetting(k);
                  return acc;
                }, {})}
              />
            </Card>
          ))}

          <Card className="p-6 sm:p-8">
            <h2 className="font-display text-lg font-semibold">Feature flags</h2>
            <p className="text-sm text-[var(--muted)] mt-1">
              Toggle phases of the platform independently.
            </p>
            <SettingsForm
              keys={["feature_flags"]}
              initial={{ feature_flags: settings.feature_flags }}
              meta={{ feature_flags: describeSetting("feature_flags") }}
            />
          </Card>

          <Card className="p-6 bg-[var(--surface-muted)]/60">
            <h3 className="font-display font-semibold">Env fallback</h3>
            <p className="text-sm text-[var(--muted)] mt-1">
              Values above come from the <code className="font-mono">platform_settings</code> table.
              When a row is missing, SBBS falls back to these environment defaults:
            </p>
            <dl className="mt-4 grid sm:grid-cols-2 gap-2 text-sm font-mono">
              <Env k="PLATFORM_BUYER_FEE_BPS" v={env.PLATFORM_BUYER_FEE_BPS} />
              <Env k="PLATFORM_SELLER_FEE_BPS" v={env.PLATFORM_SELLER_FEE_BPS} />
              <Env k="PLATFORM_RIDER_RELEASE_MOMO_BPS" v={env.PLATFORM_RIDER_RELEASE_MOMO_BPS} />
              <Env k="PLATFORM_RIDER_RELEASE_MOMO_CAP_PESEWAS" v={env.PLATFORM_RIDER_RELEASE_MOMO_CAP_PESEWAS} />
              <Env k="PLATFORM_RIDER_RELEASE_BANK_PESEWAS" v={env.PLATFORM_RIDER_RELEASE_BANK_PESEWAS} />
              <Env k="PLATFORM_SELLER_RELEASE_MOMO_BPS" v={env.PLATFORM_SELLER_RELEASE_MOMO_BPS} />
              <Env k="PLATFORM_SELLER_RELEASE_MOMO_CAP_PESEWAS" v={env.PLATFORM_SELLER_RELEASE_MOMO_CAP_PESEWAS} />
              <Env k="PLATFORM_SELLER_RELEASE_BANK_PESEWAS" v={env.PLATFORM_SELLER_RELEASE_BANK_PESEWAS} />
              <Env k="PLATFORM_RIDER_RELEASE_FEE_PESEWAS" v={env.PLATFORM_RIDER_RELEASE_FEE_PESEWAS} />
              <Env k="PLATFORM_SELLER_RELEASE_FEE_PESEWAS" v={env.PLATFORM_SELLER_RELEASE_FEE_PESEWAS} />
              <Env k="PLATFORM_TXN_CAP_PESEWAS" v={env.PLATFORM_TXN_CAP_PESEWAS} />
              <Env k="PLATFORM_AUTO_RELEASE_HOURS" v={env.PLATFORM_AUTO_RELEASE_HOURS} />
            </dl>
          </Card>
        </Container>
      </main>
    </>
  );
}

function Env({ k, v }: { k: string; v: unknown }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-dashed border-[var(--border)] py-1">
      <dt className="text-[var(--muted)]">{k}</dt>
      <dd>{String(v)}</dd>
    </div>
  );
}
