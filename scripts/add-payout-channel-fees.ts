/**
 * scripts/add-payout-channel-fees.ts
 *
 * Seeds the channel-aware release fee rows in `platform_settings`:
 *   - rider_release_momo_bps         (100      = 1%)
 *   - rider_release_momo_cap_pesewas (1000     = ₵10)
 *   - rider_release_bank_pesewas     (800      = ₵8 flat)
 *   - seller_release_momo_bps        (100      = 1%)
 *   - seller_release_momo_cap_pesewas(1000     = ₵10)
 *   - seller_release_bank_pesewas    (800      = ₵8 flat)
 *
 * Safe to re-run; uses ON CONFLICT DO NOTHING so existing admin overrides
 * are preserved.
 *
 * Usage:
 *   npx tsx scripts/add-payout-channel-fees.ts
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

loadEnv({ path: path.resolve(process.cwd(), ".env.local"), override: false });
loadEnv({ path: path.resolve(process.cwd(), ".env"), override: false });

const ROWS: Array<{ key: string; value: number; description: string }> = [
  {
    key: "rider_release_momo_bps",
    value: 100,
    description: "Rider release fee % of rider payout when paid via MoMo (Moolre)",
  },
  {
    key: "rider_release_momo_cap_pesewas",
    value: 1000,
    description: "Rider release fee cap when paid via MoMo (₵10)",
  },
  {
    key: "rider_release_bank_pesewas",
    value: 800,
    description: "Rider release fee when paid via bank transfer (Paystack), flat ₵8",
  },
  {
    key: "seller_release_momo_bps",
    value: 100,
    description: "Seller release fee % of seller payout when paid via MoMo (Moolre)",
  },
  {
    key: "seller_release_momo_cap_pesewas",
    value: 1000,
    description: "Seller release fee cap when paid via MoMo (₵10)",
  },
  {
    key: "seller_release_bank_pesewas",
    value: 800,
    description: "Seller release fee when paid via bank transfer (Paystack), flat ₵8",
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("✗ DATABASE_URL is not set");
    process.exit(1);
  }

  const sql = postgres(url, { max: 2, idle_timeout: 5, prepare: false });

  try {
    for (const row of ROWS) {
      console.log(`→ Seeding platform_settings.${row.key} (if missing)...`);
      await sql`
        INSERT INTO platform_settings (key, value, description)
        VALUES (${row.key}, to_jsonb(${row.value}::int), ${row.description})
        ON CONFLICT (key) DO NOTHING
      `;
    }
    console.log(`\n✓ Done — ${ROWS.length} channel-aware release fee rows seeded.`);
    console.log(
      "Existing transactions are unaffected; the new structure applies to new transactions only.",
    );
  } catch (err) {
    console.error("✗ Migration failed:", err);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
