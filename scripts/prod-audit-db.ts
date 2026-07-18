/**
 * Quick DB inventory for production-readiness audits.
 * Usage: npx tsx scripts/prod-audit-db.ts
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

loadEnv({ path: path.resolve(process.cwd(), ".env.local"), override: false });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, idle_timeout: 5, prepare: false, connect_timeout: 15 });
  try {
    const [counts] = await sql`
      select
        (select count(*)::int from profiles) as profiles,
        (select count(*)::int from profiles where email like '%@demo.sbbs.gh') as mock_profiles,
        (select count(*)::int from transactions) as transactions,
        (select count(*)::int from payments) as payments,
        (select count(*)::int from payouts) as payouts,
        (select count(*)::int from listings) as listings,
        (select count(*)::int from platform_settings) as settings
    `;
    const feeKeys = await sql`
      select key, value::text as value
      from platform_settings
      where key like '%release%' or key like '%fee%'
      order by key
    `;
    console.log("COUNTS", counts);
    console.log("FEE_SETTINGS");
    for (const row of feeKeys) {
      console.log(`  ${row.key} = ${row.value}`);
    }
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
