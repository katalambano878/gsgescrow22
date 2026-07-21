# Supabase → Plain PostgreSQL (Drizzle-first playbook)

Reusable guide written while migrating **Sell-Safe Buy-Safe (SBBS)** off hosted
Supabase + Vercel onto **plain Postgres (`fleet-postgres`) + Coolify on big-vps**.

Companion to Julismart Susu’s guide (`susu-next/MIGRATION_GUIDE.md`), which covers
PostgREST-compat apps. **Use this guide when the app already uses Drizzle (or
another SQL client) for data** and only relies on Supabase for Auth / Storage /
Realtime.

---

## 0. Strategy in one paragraph

Keep the app’s UX identical. Replace GoTrue with first-party cookie sessions +
OTP/password tables, replace Storage with a disk volume + signed URLs, replace
Realtime with short polling, dump/restore `public` into `fleet-postgres`, and
deploy the Next.js standalone image on Coolify. Preserve every user UUID so
orders and FKs keep working.

---

## 1. Recon (do this first)

```bash
# Where is supabase-js used?
rg -n "@supabase|createBrowserClient|createServerClient|supabase" src

# Auth surface
rg -n "signInWithOtp|signInWithPassword|verifyOtp|getUser|getSession" src

# Storage
rg -n "storage\.from|createSignedUploadUrl|createSignedUrl" src

# Realtime
rg -n "postgres_changes|\.channel\(" src

# Data path — already Drizzle?
rg -n "drizzle|getDb|DATABASE_URL" src
```

Classify each hit:

| Concern | SBBS before | After |
|---|---|---|
| Data | Drizzle → Supabase Postgres pooler | Drizzle → `fleet-postgres` |
| Auth | GoTrue phone/email OTP + password | Cookie JWT + `auth_*` tables |
| Storage | Supabase Storage | `STORAGE_ROOT` disk + signed routes |
| Realtime | `postgres_changes` | Poll `/api/admin/live` |
| Hosting | Vercel | Coolify on big-vps |
| Cron | `vercel.json` | Host crontab + `CRON_SECRET` |

**If the app uses PostgREST heavily** (`supabase.from('x').select(...)` everywhere),
follow Susu’s compat-layer guide instead.

---

## 2. Auth replacement

### Schema

- `auth_credentials` — `user_id` PK = `profiles.id`, email/phone, bcrypt `password_hash`
- `auth_otps` — hashed 6-digit codes, expiry, attempts
- `auth_sessions` — hashed opaque tokens + expiry/revoke

### Session

- Cookie `sbbs_session` = signed JWT + raw token (`jose` HS256, `AUTH_SECRET` ≥ 32 chars)
- Edge proxy peeks JWT only (`session-edge.ts`); RSC validates against DB
- Gate `/hub` and `/admin` the same way middleware/proxy did with Supabase

### Flows

- Phone OTP → send via existing SMS provider (retire GoTrue SMS hook)
- Email OTP → Resend
- Email+password → `bcryptjs` (GoTrue hashes verify with `bcrypt.compare` as-is)

### User migration

```bash
SOURCE_DATABASE_URL='postgresql://…supabase…' \
DATABASE_URL='postgresql://sbbs:…@fleet-postgres:5432/sbbs' \
npx tsx scripts/migrate-auth-from-supabase.ts
```

Or export `auth.users` → SQL upserts preserving UUIDs (what we did for SBBS).

**Never regenerate IDs** — every FK in the app points at `profiles.id`.

---

## 3. Storage

Split modules so clients never import Node `fs`:

- `@/lib/storage/shared` — buckets, mimes, `publicListingUrl`, path helpers
- `@/lib/storage/server` — `import "server-only"`, disk read/write, HMAC URLs

Routes:

- `PUT /api/upload/put` — signed upload write
- `GET /api/storage/sign/[bucket]/[...path]` — private read
- `GET /api/storage/public/listings/[...path]` — public listing images

Coolify: persistent volume host path → `/data/storage`, `chown 1001:1001`.

---

## 4. Realtime → polling

Replace `postgres_changes` with a visibility-aware 3–4s poll of an admin-only
JSON endpoint that returns recent rows as pseudo-events (same shape the UI
already expected).

---

## 5. Database (fleet-postgres on big-vps)

```bash
ssh big-vps
PW=$(openssl rand -hex 24)
echo "$PW" > ~/.config/coolify-vps/<app>-pg-pw && chmod 600 ~/.config/coolify-vps/<app>-pg-pw

docker exec fleet-postgres psql -U postgres -c "CREATE ROLE <app> LOGIN PASSWORD '$PW';"
docker exec fleet-postgres psql -U postgres -c "CREATE DATABASE <app> OWNER <app>;"
```

Dump (use a client matching server major version; password may contain `@`):

```bash
# Prefer PG* env vars over a URL when the password has @
export PGUSER=postgres.<ref>
export PGPASSWORD='…'
export PGHOST=aws-0-….pooler.supabase.com
export PGPORT=6543
export PGDATABASE=postgres
pg_dump --schema=public --no-owner --no-privileges --clean --if-exists -f public.sql
```

Restore notes for PG17 → PG16:

- Strip `\restrict` / `\unrestrict`
- Strip `SET transaction_timeout`
- Strip `DROP SCHEMA public` / `CREATE SCHEMA` (restore into a fresh schema)
- Drop FKs to `auth.users`; disable/drop RLS policies that call `auth.uid()`
- `ALTER … OWNER TO <app>` + grants

App `DATABASE_URL` on Coolify:

`postgresql://<app>:<pw>@fleet-postgres:5432/<app>`

(Use `fleet-pgbouncer` if that is the fleet convention for the host.)

---

## 6. Coolify deploy

1. `output: "standalone"` in `next.config.ts`
2. Multi-stage `Dockerfile` (Node 22 Alpine), `ARG`/`ENV` for `NEXT_PUBLIC_*` only
3. Coolify app: private deploy key → GitHub repo, build pack `dockerfile`
4. FQDN via Coolify DB or UI: `https://your.domain`
5. Bulk envs: `DATABASE_URL`, `AUTH_SECRET`, PSP/SMS/email, `STORAGE_*`, `CRON_SECRET`
6. Mark `NEXT_PUBLIC_*` as build-time
7. Persistent storage for `STORAGE_ROOT`
8. Pre-DNS: `curl -k --resolve your.domain:443:127.0.0.1 https://your.domain/api/health`
9. DNS A → big-vps `169.58.8.203`; Traefik issues Let’s Encrypt

### Cron (replace Vercel)

```cron
*/15 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your.domain/api/cron/auto-release
0 * * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your.domain/api/cron/payout-sweep
15 6 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your.domain/api/cron/daily-recon
```

Fail closed when `CRON_SECRET` is missing in production.

---

## 7. Cutover checklist

1. Freeze writes on old host if still live
2. Final dump/restore + auth import delta
3. Point DNS at big-vps
4. Update PSP webhook URLs if they were Vercel-only (same domain preferred)
5. Smoke: phone OTP, password login, create txn, MoMo pay, dispatch, delivery code, admin ticker, cron 401/200
6. Keep Supabase project intact ~1 week for rollback, then archive

---

## 8. Gotchas (SBBS)

- Supabase pooler passwords with `@` break naive URL parsing — use `PG*` env vars
- `pg_dump` major version must match (17 client for 17 server)
- Turbopack will fail the build if a Client Component imports a module that uses `node:fs` — split `shared` vs `server`
- Vercel soft-block / expired subscription cannot set envs or deploy — migrate hosting first when billing is dead
- Empty “sensitive” env vars on Vercel can look updated but stay empty when the account is suspended
- Claim-token signing must use `AUTH_SECRET` (not a public URL fallback) in production
- `isAuthLive` becomes `Boolean(AUTH_SECRET && length >= 32)`, not Supabase URL/anon key

---

## 9. SBBS production map (after cutover)

| Item | Value |
|---|---|
| App | Coolify `sbbs-app` uuid `fw6t2h40stumd21zbx8w9nk0` |
| Domain | `https://sellbuysafe.gsgbrands.com.gh` |
| DB | `fleet-postgres` database/role `sbbs` |
| DB password file | `~/.config/coolify-vps/sbbs-pg-pw` on big-vps |
| Storage | `/data/coolify/applications/fw6t2h40stumd21zbx8w9nk0/storage` → `/data/storage` |
| GitHub | `Drrbarns/gsgescrow22` branch `main` |
