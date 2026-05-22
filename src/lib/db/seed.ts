import "dotenv/config";
import { getDb } from "./client";
import { platformSettings } from "./schema";

const DEFAULTS = [
  { key: "buyer_fee_bps", value: 150, description: "Buyer platform fee in basis points (100 = 1%)" },
  { key: "seller_fee_bps", value: 150, description: "Seller platform fee in basis points" },
  { key: "rider_release_fee_pesewas", value: 200, description: "[legacy] Flat rider release fee" },
  { key: "seller_release_fee_pesewas", value: 200, description: "[legacy] Flat seller release fee" },
  { key: "rider_release_momo_bps", value: 100, description: "Rider release fee % of rider payout when paid via MoMo (Moolre)" },
  { key: "rider_release_momo_cap_pesewas", value: 1000, description: "Rider release fee cap when paid via MoMo (₵10)" },
  { key: "seller_release_momo_bps", value: 100, description: "Seller release fee % of seller payout when paid via MoMo (Moolre)" },
  { key: "seller_release_momo_cap_pesewas", value: 1000, description: "Seller release fee cap when paid via MoMo (₵10)" },
  { key: "rider_release_bank_pesewas", value: 800, description: "Rider release fee when paid via bank transfer (Paystack), flat ₵8" },
  { key: "seller_release_bank_pesewas", value: 800, description: "Seller release fee when paid via bank transfer (Paystack), flat ₵8" },
  { key: "txn_cap_pesewas", value: 200000, description: "Per-transaction cap; ₵2,000 in soft launch" },
  { key: "auto_release_hours", value: 72, description: "Hours before auto-release fires" },
  { key: "two_approver_threshold_pesewas", value: 500000, description: "Above this, payouts need two approvers" },
  { key: "marketplace_listing_fee_pesewas", value: 500, description: "Per-listing fee for the future marketplace" },
  { key: "trust_badge_premium_monthly_pesewas", value: 5000, description: "Premium analytics tier monthly fee" },
  { key: "feature_flags", value: { rider_marketplace: false, badge_premium: false, multi_psp: false }, description: "Phase rollout toggles" },
];

async function main() {
  const db = getDb();
  for (const s of DEFAULTS) {
    await db
      .insert(platformSettings)
      .values({
        key: s.key,
        value: s.value as unknown as Record<string, unknown>,
        description: s.description,
      })
      .onConflictDoNothing();
    console.log(`✓ seeded ${s.key}`);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
