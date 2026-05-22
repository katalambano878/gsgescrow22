import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { platformSettings } from "@/lib/db/schema";
import { env, isDbLive } from "@/lib/env";

export interface PlatformConfig {
  buyer_fee_bps: number;
  seller_fee_bps: number;
  /** @deprecated kept so old admin rows render. New logic uses the rider_release_momo_* and rider_release_bank_* keys below. */
  rider_release_fee_pesewas: number;
  /** @deprecated kept so old admin rows render. New logic uses the seller_release_momo_* and seller_release_bank_* keys below. */
  seller_release_fee_pesewas: number;
  // MoMo releases (Moolre): rate-based with a cap.
  rider_release_momo_bps: number;
  rider_release_momo_cap_pesewas: number;
  seller_release_momo_bps: number;
  seller_release_momo_cap_pesewas: number;
  // Bank releases (Paystack): flat per transfer.
  rider_release_bank_pesewas: number;
  seller_release_bank_pesewas: number;
  txn_cap_pesewas: number;
  auto_release_hours: number;
  two_approver_threshold_pesewas: number;
  marketplace_listing_fee_pesewas: number;
  trust_badge_premium_monthly_pesewas: number;
  dispute_sla_business_days: number;
  payout_max_retries: number;
  high_value_alert_pesewas: number;
  new_seller_days_threshold: number;
  new_seller_max_payout_pesewas: number;
  pause_new_transactions: boolean;
  pause_payouts: boolean;
  maintenance_banner: string | null;
  feature_flags: FeatureFlags;
  bootstrap_admin_emails: string[];
}

export interface FeatureFlags {
  rider_marketplace: boolean;
  badge_premium: boolean;
  multi_psp: boolean;
  bulk_approve: boolean;
  sse_dashboard: boolean;
  csv_exports: boolean;
  impersonation: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  rider_marketplace: false,
  badge_premium: false,
  multi_psp: false,
  bulk_approve: true,
  sse_dashboard: true,
  csv_exports: true,
  impersonation: true,
};

function defaults(): PlatformConfig {
  return {
    buyer_fee_bps: env.PLATFORM_BUYER_FEE_BPS,
    seller_fee_bps: env.PLATFORM_SELLER_FEE_BPS,
    rider_release_fee_pesewas: env.PLATFORM_RIDER_RELEASE_FEE_PESEWAS,
    seller_release_fee_pesewas: env.PLATFORM_SELLER_RELEASE_FEE_PESEWAS,
    rider_release_momo_bps: env.PLATFORM_RIDER_RELEASE_MOMO_BPS,
    rider_release_momo_cap_pesewas: env.PLATFORM_RIDER_RELEASE_MOMO_CAP_PESEWAS,
    seller_release_momo_bps: env.PLATFORM_SELLER_RELEASE_MOMO_BPS,
    seller_release_momo_cap_pesewas: env.PLATFORM_SELLER_RELEASE_MOMO_CAP_PESEWAS,
    rider_release_bank_pesewas: env.PLATFORM_RIDER_RELEASE_BANK_PESEWAS,
    seller_release_bank_pesewas: env.PLATFORM_SELLER_RELEASE_BANK_PESEWAS,
    txn_cap_pesewas: env.PLATFORM_TXN_CAP_PESEWAS,
    auto_release_hours: env.PLATFORM_AUTO_RELEASE_HOURS,
    two_approver_threshold_pesewas: 500_000,
    marketplace_listing_fee_pesewas: 500,
    trust_badge_premium_monthly_pesewas: 5000,
    dispute_sla_business_days: 5,
    payout_max_retries: 3,
    high_value_alert_pesewas: 100_000,
    new_seller_days_threshold: 14,
    new_seller_max_payout_pesewas: 500_000,
    pause_new_transactions: false,
    pause_payouts: false,
    maintenance_banner: null,
    feature_flags: DEFAULT_FLAGS,
    bootstrap_admin_emails: [],
  };
}

export const getSettings = cache(async (): Promise<PlatformConfig> => {
  const base = defaults();
  if (!isDbLive) return base;
  try {
    const db = getDb();
    const rows = await db.select().from(platformSettings);
    const result: Record<string, unknown> = { ...base };
    for (const row of rows) {
      const key = row.key as keyof PlatformConfig;
      const v = row.value;
      if (key === "feature_flags") {
        result.feature_flags = { ...DEFAULT_FLAGS, ...(v as Partial<FeatureFlags>) };
      } else {
        result[key] = v as unknown;
      }
    }
    return result as unknown as PlatformConfig;
  } catch {
    return base;
  }
});

export async function getSetting<K extends keyof PlatformConfig>(key: K): Promise<PlatformConfig[K]> {
  const cfg = await getSettings();
  return cfg[key];
}

export async function isFeatureEnabled(flag: keyof FeatureFlags): Promise<boolean> {
  const cfg = await getSettings();
  return Boolean(cfg.feature_flags?.[flag]);
}

export async function updateSetting<K extends keyof PlatformConfig>(
  key: K,
  value: PlatformConfig[K],
  actorId?: string,
): Promise<void> {
  if (!isDbLive) throw new Error("DB not configured");
  const db = getDb();
  await db
    .insert(platformSettings)
    .values({
      key: key as string,
      value: value as unknown as Record<string, unknown>,
      updatedBy: actorId ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: {
        value: value as unknown as Record<string, unknown>,
        updatedBy: actorId ?? null,
        updatedAt: new Date(),
      },
    });
}

export function describeSetting(key: keyof PlatformConfig): {
  label: string;
  hint?: string;
  kind: "number" | "pesewas" | "bps" | "boolean" | "string" | "flags" | "emails";
  group: "economics" | "operations" | "risk" | "commercial" | "flags";
} {
  const m: Record<keyof PlatformConfig, ReturnType<typeof describeSetting>> = {
    buyer_fee_bps: { label: "Buyer fee", hint: "Basis points, 100 = 1%", kind: "bps", group: "economics" },
    seller_fee_bps: { label: "Seller fee", hint: "Basis points, 100 = 1%", kind: "bps", group: "economics" },
    rider_release_fee_pesewas: { label: "Rider release fee (legacy)", hint: "Deprecated — see rider_release_momo_* and rider_release_bank_pesewas", kind: "pesewas", group: "economics" },
    seller_release_fee_pesewas: { label: "Seller release fee (legacy)", hint: "Deprecated — see seller_release_momo_* and seller_release_bank_pesewas", kind: "pesewas", group: "economics" },
    rider_release_momo_bps: { label: "Rider release · MoMo %", hint: "Basis points of rider payout (100 = 1%). Capped by the cap setting.", kind: "bps", group: "economics" },
    rider_release_momo_cap_pesewas: { label: "Rider release · MoMo cap", hint: "Max rider release fee when paying via Moolre MoMo", kind: "pesewas", group: "economics" },
    seller_release_momo_bps: { label: "Seller release · MoMo %", hint: "Basis points of seller payout (100 = 1%). Capped by the cap setting.", kind: "bps", group: "economics" },
    seller_release_momo_cap_pesewas: { label: "Seller release · MoMo cap", hint: "Max seller release fee when paying via Moolre MoMo", kind: "pesewas", group: "economics" },
    rider_release_bank_pesewas: { label: "Rider release · Bank flat", hint: "Flat rider release fee when paying via Paystack bank transfer", kind: "pesewas", group: "economics" },
    seller_release_bank_pesewas: { label: "Seller release · Bank flat", hint: "Flat seller release fee when paying via Paystack bank transfer", kind: "pesewas", group: "economics" },
    txn_cap_pesewas: { label: "Transaction cap", hint: "Max total charged per deal", kind: "pesewas", group: "operations" },
    auto_release_hours: { label: "Auto-release window", hint: "Hours before payout auto-queues", kind: "number", group: "operations" },
    two_approver_threshold_pesewas: { label: "Two-approver threshold", hint: "Above this amount, payouts need two approvers", kind: "pesewas", group: "risk" },
    marketplace_listing_fee_pesewas: { label: "Marketplace listing fee", kind: "pesewas", group: "commercial" },
    trust_badge_premium_monthly_pesewas: { label: "Premium badge (monthly)", kind: "pesewas", group: "commercial" },
    dispute_sla_business_days: { label: "Dispute SLA", hint: "Business days", kind: "number", group: "operations" },
    payout_max_retries: { label: "Payout retries", kind: "number", group: "operations" },
    high_value_alert_pesewas: { label: "High-value alert threshold", hint: "Alerts when a payout crosses this", kind: "pesewas", group: "risk" },
    new_seller_days_threshold: { label: "New seller age (days)", kind: "number", group: "risk" },
    new_seller_max_payout_pesewas: { label: "New seller payout cap", kind: "pesewas", group: "risk" },
    pause_new_transactions: { label: "Pause new transactions", kind: "boolean", group: "operations" },
    pause_payouts: { label: "Pause payouts", kind: "boolean", group: "operations" },
    maintenance_banner: { label: "Maintenance banner text", kind: "string", group: "operations" },
    feature_flags: { label: "Feature flags", kind: "flags", group: "flags" },
    bootstrap_admin_emails: {
      label: "Superadmin bootstrap emails",
      hint: "Comma-separated list. Anyone signing up with these emails becomes superadmin automatically.",
      kind: "emails",
      group: "operations",
    },
  };
  return m[key];
}
