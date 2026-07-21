/**
 * Import Supabase GoTrue `auth.users` into first-party `auth_credentials`.
 *
 * Usage:
 *   SOURCE_DATABASE_URL='postgresql://...' \
 *   DATABASE_URL='postgresql://...' \
 *   npx tsx scripts/migrate-auth-from-supabase.ts
 *
 * SOURCE_DATABASE_URL — Supabase (or any) Postgres that still has auth.users
 * DATABASE_URL        — destination plain Postgres (fleet-postgres / local)
 *
 * Preserves UUIDs. GoTrue bcrypt password hashes are copied as-is.
 */
import "dotenv/config";
import postgres from "postgres";

type AuthUser = {
  id: string;
  email: string | null;
  phone: string | null;
  encrypted_password: string | null;
  email_confirmed_at: Date | null;
  phone_confirmed_at: Date | null;
  created_at: Date | null;
  raw_user_meta_data: Record<string, unknown> | null;
};

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL;
  const destUrl = process.env.DATABASE_URL;
  if (!sourceUrl || !destUrl) {
    console.error("Need SOURCE_DATABASE_URL (or DATABASE_URL) and DATABASE_URL");
    process.exit(1);
  }

  const src = postgres(sourceUrl, { max: 2, prepare: false });
  const dest = postgres(destUrl, { max: 2, prepare: false });

  console.log("[migrate-auth] Reading auth.users from source…");
  let users: AuthUser[] = [];
  try {
    users = await src<AuthUser[]>`
      SELECT id, email, phone, encrypted_password,
             email_confirmed_at, phone_confirmed_at, created_at,
             raw_user_meta_data
      FROM auth.users
      ORDER BY created_at ASC NULLS LAST
    `;
  } catch (err) {
    console.error("[migrate-auth] Failed to read auth.users:", (err as Error).message);
    console.error("If auth schema is unavailable, pass a dump via SOURCE_DATABASE_URL.");
    process.exit(1);
  }
  console.log(`[migrate-auth] Found ${users.length} auth users`);

  let profilesCreated = 0;
  let credsUpserted = 0;

  for (const u of users) {
    const email = u.email?.toLowerCase() || null;
    const phone = u.phone || null;
    const displayName =
      (typeof u.raw_user_meta_data?.display_name === "string"
        ? u.raw_user_meta_data.display_name
        : null) ||
      email?.split("@")[0] ||
      (phone ? `User ${phone.slice(-4)}` : "Migrated user");

    const [existingProfile] = await dest<{ id: string }[]>`
      SELECT id FROM profiles WHERE id = ${u.id} LIMIT 1
    `;
    if (!existingProfile) {
      await dest`
        INSERT INTO profiles (id, email, phone, display_name, role, created_at, updated_at)
        VALUES (
          ${u.id},
          ${email},
          ${phone},
          ${displayName},
          'buyer',
          ${u.created_at ?? new Date()},
          NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `;
      profilesCreated += 1;
    } else {
      await dest`
        UPDATE profiles SET
          email = COALESCE(email, ${email}),
          phone = COALESCE(phone, ${phone}),
          updated_at = NOW()
        WHERE id = ${u.id}
      `;
    }

    await dest`
      INSERT INTO auth_credentials (
        user_id, email, phone, password_hash,
        email_confirmed_at, phone_confirmed_at, created_at, updated_at
      ) VALUES (
        ${u.id},
        ${email},
        ${phone},
        ${u.encrypted_password},
        ${u.email_confirmed_at},
        ${u.phone_confirmed_at},
        ${u.created_at ?? new Date()},
        NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, auth_credentials.email),
        phone = COALESCE(EXCLUDED.phone, auth_credentials.phone),
        password_hash = COALESCE(EXCLUDED.password_hash, auth_credentials.password_hash),
        email_confirmed_at = COALESCE(EXCLUDED.email_confirmed_at, auth_credentials.email_confirmed_at),
        phone_confirmed_at = COALESCE(EXCLUDED.phone_confirmed_at, auth_credentials.phone_confirmed_at),
        updated_at = NOW()
    `;
    credsUpserted += 1;
  }

  console.log(
    `[migrate-auth] Done. profiles_created=${profilesCreated} credentials_upserted=${credsUpserted}`,
  );
  await src.end();
  await dest.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
