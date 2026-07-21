# Sell-Safe Buy-Safe (SBBS)

Ghana's protected checkout for informal social commerce.

> A trusted middleman that holds the buyer's money until delivery is confirmed, then releases payment to the seller.

## Stack

- **Framework**: Next.js 16 (App Router, RSC, Server Actions) + TypeScript
- **Database**: Plain PostgreSQL (`fleet-postgres` on big-vps) via Drizzle
- **Auth**: First-party cookie sessions + phone/email OTP + password (`AUTH_SECRET`)
- **Storage**: Disk volume (`STORAGE_ROOT`) with HMAC-signed URLs
- **Payments**: Moolre (MoMo primary); Paystack card kill-switched
- **SMS**: Moolre (+ Hubtel failover)
- **Email**: Resend
- **Hosting**: Coolify on **big-vps** (`https://sellbuysafe.gsgbrands.com.gh`)
- **Cron**: Host crontab with `Authorization: Bearer $CRON_SECRET`

Migration playbook (Supabase → plain Postgres): see
[`docs/SUPABASE_TO_PLAIN_POSTGRES.md`](docs/SUPABASE_TO_PLAIN_POSTGRES.md).

## Local setup

```bash
npm install
cp .env.example .env.local
# Set DATABASE_URL, AUTH_SECRET (32+ chars), Moolre/Resend keys
npm run db:push
npm run db:seed
npm run dev
```

## Production (Coolify)

| Item | Value |
|---|---|
| Coolify app | `sbbs-app` (`fw6t2h40stumd21zbx8w9nk0`) |
| Domain | `https://sellbuysafe.gsgbrands.com.gh` |
| DB | `fleet-postgres` / database `sbbs` |
| Deploy | push to `main` on `Drrbarns/gsgescrow22`, or Coolify force deploy |

```bash
curl -X POST "http://169.58.8.203:8000/api/v1/deploy?uuid=fw6t2h40stumd21zbx8w9nk0&force=true" \
  -H "Authorization: Bearer $(cat ~/.config/coolify-vps/token-bigvps)"
```

## Cron (big-vps)

```cron
*/15 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://sellbuysafe.gsgbrands.com.gh/api/cron/auto-release
0 * * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://sellbuysafe.gsgbrands.com.gh/api/cron/payout-sweep
15 6 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://sellbuysafe.gsgbrands.com.gh/api/cron/daily-recon
```
