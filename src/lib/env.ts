import { z } from "zod";

// --- IMPORTANT ---
// On the client, Next.js only inlines `process.env.NEXT_PUBLIC_*` references
// when you access them as literal property lookups (e.g. `process.env.NEXT_PUBLIC_FOO`).
// Passing `process.env` as a whole to anything dynamic (like `Object.entries`
// or `Zod.safeParse`) yields `{}` in the browser bundle. The old version of
// this file did that and silently left NEXT_PUBLIC_* undefined on the client.
//
// We now explicitly read every variable by name so the bundler can do
// static replacement, then build one object and parse it once.

const rawEnv = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,

  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_AUTH_HOOK_SECRET: process.env.SUPABASE_AUTH_HOOK_SECRET,

  DATABASE_URL: process.env.DATABASE_URL,

  MOOLRE_USERNAME: process.env.MOOLRE_USERNAME,
  MOOLRE_PUBLIC_KEY: process.env.MOOLRE_PUBLIC_KEY,
  MOOLRE_API_KEY: process.env.MOOLRE_API_KEY,
  MOOLRE_ACCOUNT_NUMBER: process.env.MOOLRE_ACCOUNT_NUMBER,
  MOOLRE_BUSINESS_EMAIL: process.env.MOOLRE_BUSINESS_EMAIL,
  MOOLRE_WEBHOOK_SECRET: process.env.MOOLRE_WEBHOOK_SECRET,
  MOOLRE_DASHBOARD_BASE: process.env.MOOLRE_DASHBOARD_BASE,

  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
  PAYSTACK_PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY,
  PAYSTACK_WEBHOOK_SECRET: process.env.PAYSTACK_WEBHOOK_SECRET,
  // Master kill-switch for card (Paystack) checkout. Set to "true" to re-enable
  // the Card payments tile on /buy/checkout. Defaults to disabled so we only
  // surface Mobile Money (Moolre) until card payments are re-validated.
  CARD_PAYMENTS_ENABLED: process.env.CARD_PAYMENTS_ENABLED,

  MOOLRE_SMS_VASKEY: process.env.MOOLRE_SMS_VASKEY,
  MOOLRE_SMS_SENDER_ID: process.env.MOOLRE_SMS_SENDER_ID,
  MOOLRE_SMS_SCENARIO: process.env.MOOLRE_SMS_SCENARIO,
  OPS_ALERT_PHONES: process.env.OPS_ALERT_PHONES,

  HUBTEL_CLIENT_ID: process.env.HUBTEL_CLIENT_ID,
  HUBTEL_CLIENT_SECRET: process.env.HUBTEL_CLIENT_SECRET,
  HUBTEL_SENDER_ID: process.env.HUBTEL_SENDER_ID,

  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM: process.env.RESEND_FROM,

  CRON_SECRET: process.env.CRON_SECRET,
  RECON_REPORT_TO: process.env.RECON_REPORT_TO,

  PLATFORM_BUYER_FEE_BPS: process.env.PLATFORM_BUYER_FEE_BPS,
  PLATFORM_SELLER_FEE_BPS: process.env.PLATFORM_SELLER_FEE_BPS,
  PLATFORM_RIDER_RELEASE_FEE_PESEWAS: process.env.PLATFORM_RIDER_RELEASE_FEE_PESEWAS,
  PLATFORM_SELLER_RELEASE_FEE_PESEWAS: process.env.PLATFORM_SELLER_RELEASE_FEE_PESEWAS,
  PLATFORM_RIDER_RELEASE_MOMO_BPS: process.env.PLATFORM_RIDER_RELEASE_MOMO_BPS,
  PLATFORM_RIDER_RELEASE_MOMO_CAP_PESEWAS: process.env.PLATFORM_RIDER_RELEASE_MOMO_CAP_PESEWAS,
  PLATFORM_RIDER_RELEASE_BANK_PESEWAS: process.env.PLATFORM_RIDER_RELEASE_BANK_PESEWAS,
  PLATFORM_SELLER_RELEASE_MOMO_BPS: process.env.PLATFORM_SELLER_RELEASE_MOMO_BPS,
  PLATFORM_SELLER_RELEASE_MOMO_CAP_PESEWAS: process.env.PLATFORM_SELLER_RELEASE_MOMO_CAP_PESEWAS,
  PLATFORM_SELLER_RELEASE_BANK_PESEWAS: process.env.PLATFORM_SELLER_RELEASE_BANK_PESEWAS,
  PLATFORM_TXN_CAP_PESEWAS: process.env.PLATFORM_TXN_CAP_PESEWAS,
  PLATFORM_AUTO_RELEASE_HOURS: process.env.PLATFORM_AUTO_RELEASE_HOURS,
} as const;

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_NAME: z.string().default("Sell-Safe Buy-Safe"),

  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_AUTH_HOOK_SECRET: z.string().optional(),

  DATABASE_URL: z.string().optional(),

  MOOLRE_USERNAME: z.string().optional(),
  MOOLRE_PUBLIC_KEY: z.string().optional(),
  MOOLRE_API_KEY: z.string().optional(),
  MOOLRE_ACCOUNT_NUMBER: z.string().optional(),
  MOOLRE_BUSINESS_EMAIL: z.string().optional(),
  MOOLRE_WEBHOOK_SECRET: z.string().optional(),
  MOOLRE_DASHBOARD_BASE: z.string().optional(),

  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),
  CARD_PAYMENTS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),

  MOOLRE_SMS_VASKEY: z.string().optional(),
  MOOLRE_SMS_SENDER_ID: z.string().default("SBBS"),
  MOOLRE_SMS_SCENARIO: z.string().optional(),
  OPS_ALERT_PHONES: z.string().optional(),

  HUBTEL_CLIENT_ID: z.string().optional(),
  HUBTEL_CLIENT_SECRET: z.string().optional(),
  HUBTEL_SENDER_ID: z.string().default("SBBS"),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().default("SBBS <hello@sbbs.gh>"),

  CRON_SECRET: z.string().optional(),
  RECON_REPORT_TO: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .pipe(z.string().email().optional()),

  PLATFORM_BUYER_FEE_BPS: z.coerce.number().default(150),
  PLATFORM_SELLER_FEE_BPS: z.coerce.number().default(150),
  PLATFORM_RIDER_RELEASE_FEE_PESEWAS: z.coerce.number().default(200),
  PLATFORM_SELLER_RELEASE_FEE_PESEWAS: z.coerce.number().default(200),
  // MoMo (Moolre) — % of released amount, capped.
  PLATFORM_RIDER_RELEASE_MOMO_BPS: z.coerce.number().default(100),
  PLATFORM_RIDER_RELEASE_MOMO_CAP_PESEWAS: z.coerce.number().default(1000),
  PLATFORM_SELLER_RELEASE_MOMO_BPS: z.coerce.number().default(100),
  PLATFORM_SELLER_RELEASE_MOMO_CAP_PESEWAS: z.coerce.number().default(1000),
  // Bank (Paystack) — flat per transfer.
  PLATFORM_RIDER_RELEASE_BANK_PESEWAS: z.coerce.number().default(800),
  PLATFORM_SELLER_RELEASE_BANK_PESEWAS: z.coerce.number().default(800),
  PLATFORM_TXN_CAP_PESEWAS: z.coerce.number().default(200000),
  PLATFORM_AUTO_RELEASE_HOURS: z.coerce.number().default(72),
});

const parsed = schema.safeParse(rawEnv);

let env_: z.infer<typeof schema>;
if (parsed.success) {
  env_ = parsed.data;
} else {
  console.warn(
    "[env] Some env vars failed validation. Clearing bad fields and keeping the rest:",
    parsed.error.flatten().fieldErrors,
  );
  // Clear only the invalid fields and re-parse so we keep every good one.
  const bad = new Set(Object.keys(parsed.error.flatten().fieldErrors));
  const filtered = Object.fromEntries(
    Object.entries(rawEnv).filter(([k]) => !bad.has(k)),
  );
  env_ = schema.parse(filtered);
}
export const env = env_;

export const isMoolreLive = Boolean(
  env.MOOLRE_USERNAME &&
    env.MOOLRE_PUBLIC_KEY &&
    env.MOOLRE_API_KEY &&
    env.MOOLRE_ACCOUNT_NUMBER,
);
export const isPaystackLive = Boolean(env.PAYSTACK_SECRET_KEY);
/**
 * Whether card (Paystack) checkout should be offered to buyers. Even when
 * Paystack secrets are configured, we still respect the kill-switch so the
 * UI and the server action can be flipped together with a single env var.
 */
export const isCardCheckoutEnabled = isPaystackLive && env.CARD_PAYMENTS_ENABLED;
export const isPaymentsLive = isMoolreLive || isPaystackLive;
export const isMoolreSmsLive = Boolean(env.MOOLRE_SMS_VASKEY);
export const isHubtelSmsLive = Boolean(env.HUBTEL_CLIENT_ID && env.HUBTEL_CLIENT_SECRET);
export const isSmsLive = isMoolreSmsLive || isHubtelSmsLive;
export const isEmailLive = Boolean(env.RESEND_API_KEY);
export const isDbLive = Boolean(env.DATABASE_URL);
export const isAuthLive = Boolean(
  env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
