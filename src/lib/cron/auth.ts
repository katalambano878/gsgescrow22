import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

/**
 * Fail-closed cron auth.
 *
 * Previously we only checked the bearer when CRON_SECRET was set, which meant
 * an empty/missing secret on Vercel left every cron endpoint publicly callable.
 * In production we require a non-empty CRON_SECRET and a matching Bearer token.
 * Local/dev without CRON_SECRET still works so scripts can invoke crons.
 */
export async function assertCronAuthorized(): Promise<NextResponse | null> {
  const secret = env.CRON_SECRET?.trim();
  const auth = (await headers()).get("authorization") ?? "";
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

  if (!secret) {
    if (isProd) {
      return NextResponse.json(
        { ok: false, error: "CRON_SECRET is not configured" },
        { status: 503 },
      );
    }
    return null;
  }

  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
