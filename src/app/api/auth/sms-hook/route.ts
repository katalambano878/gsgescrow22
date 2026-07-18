import { NextResponse } from "next/server";
import { headers } from "next/headers";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import { sendSms } from "@/lib/sms";
import { audit } from "@/lib/audit/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Supabase Auth — Send SMS hook.
 *
 * Configure in Supabase dashboard:
 *   Auth → Hooks → Send SMS Hook
 *     Endpoint: https://<your-domain>/api/auth/sms-hook
 *     Secret:   (Supabase generates, paste into SUPABASE_AUTH_HOOK_SECRET)
 *
 * Supabase signs the request body with HMAC-SHA256 using the standard-webhooks
 * format. We verify before forwarding to Moolre so a random IP can't spam
 * our sender ID with fake OTPs.
 *
 * Payload shape (from Supabase):
 *   {
 *     "user":  { id, phone, email, ... },
 *     "sms":   { otp, token, code_challenge? }
 *   }
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const h = await headers();

  // -- Standard-webhooks signature verification -----------------------
  const webhookId = h.get("webhook-id") ?? "";
  const webhookTimestamp = h.get("webhook-timestamp") ?? "";
  const webhookSignature = h.get("webhook-signature") ?? "";
  const secret = env.SUPABASE_AUTH_HOOK_SECRET;
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

  // Fail closed in production — an unsigned SMS hook is an open OTP spam relay.
  if (!secret) {
    if (isProd) {
      return NextResponse.json(
        { error: "SUPABASE_AUTH_HOOK_SECRET is not configured" },
        { status: 503 },
      );
    }
  } else {
    if (!webhookId || !webhookTimestamp || !webhookSignature) {
      return NextResponse.json(
        { error: "Missing webhook signature headers" },
        { status: 401 },
      );
    }
    // Reject payloads older than 5 minutes — prevents replay.
    const ageSeconds = Math.abs(Date.now() / 1000 - Number(webhookTimestamp));
    if (!Number.isFinite(ageSeconds) || ageSeconds > 5 * 60) {
      return NextResponse.json({ error: "Stale webhook" }, { status: 401 });
    }

    // Supabase gives a secret like `v1,whsec_<base64>`. Strip the prefix.
    const secretBytes = Buffer.from(
      secret.replace(/^v1,\s*/, "").replace(/^whsec_/, ""),
      "base64",
    );
    const signed = `${webhookId}.${webhookTimestamp}.${raw}`;
    const expected = crypto
      .createHmac("sha256", secretBytes)
      .update(signed)
      .digest("base64");

    // `webhook-signature` can carry multiple signatures: "v1,sig1 v1,sig2".
    const provided = webhookSignature
      .split(" ")
      .map((s) => s.replace(/^v1,/, ""));
    const ok = provided.some((p) => timingSafeEqualBase64(p, expected));
    if (!ok) {
      return NextResponse.json({ error: "Bad signature" }, { status: 401 });
    }
  }

  // -- Parse + dispatch -----------------------------------------------
  let payload: {
    user?: { id?: string; phone?: string; email?: string };
    sms?: { otp?: string; token?: string };
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const phone = payload.user?.phone;
  const otp = payload.sms?.otp ?? payload.sms?.token;

  if (!phone || !otp) {
    return NextResponse.json(
      { error: "Missing phone or otp in payload" },
      { status: 400 },
    );
  }

  const body = `Your SBBS sign-in code is ${otp}. Do not share it. Expires in 10 minutes.`;

  const result = await sendSms({
    to: phone,
    body,
    kind: "auth.otp",
    targetType: "auth_user",
    targetId: payload.user?.id ?? "",
  });

  if (!result.ok) {
    // Log the failure but don't leak internals. Supabase retries on 5xx.
    await audit({
      action: "auth.login",
      targetType: "sms_hook",
      targetId: payload.user?.id ?? "unknown",
      reason: "SMS send failed",
      payload: { error: result.error, phone },
    });
    return NextResponse.json(
      { error: "SMS delivery failed" },
      { status: 500 },
    );
  }

  // sendSms() has already written the sms_log row with kind="auth.otp".
  // The audit row below is what ops reads first when debugging login issues.
  await audit({
    action: "auth.login",
    targetType: "auth_user",
    targetId: payload.user?.id ?? "unknown",
    reason: "OTP sent",
    payload: { provider: result.provider, messageId: result.providerMessageId },
  });

  return NextResponse.json({ ok: true });
}

function timingSafeEqualBase64(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "base64");
    const bb = Buffer.from(b, "base64");
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}
