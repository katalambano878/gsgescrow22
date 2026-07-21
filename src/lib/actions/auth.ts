"use server";

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull, desc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import {
  authCredentials,
  authOtps,
  profiles,
} from "@/lib/db/schema";
import { isAuthLive, isDbLive, isEmailLive } from "@/lib/env";
import { normalizeGhPhone } from "@/lib/utils";
import { sendSms } from "@/lib/sms";
import { sendEmail } from "@/lib/email";
import { rateLimit } from "@/lib/idempotency";
import {
  clearSessionCookie,
  createSession,
  generateOtpCode,
  getSessionClaims,
  hashOtp,
  revokeSession,
  setSessionCookie,
} from "@/lib/auth/cookies";
import { ensureProfile } from "@/lib/actions/ensure-profile";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

type AuthResult = { ok: true } | { ok: false; error: string };

function authConfigured(): AuthResult | null {
  if (!isAuthLive) return { ok: false, error: "Auth is not configured (AUTH_SECRET)" };
  if (!isDbLive) return { ok: false, error: "Database is not configured" };
  return null;
}

async function issueSession(user: {
  id: string;
  email?: string | null;
  phone?: string | null;
}): Promise<AuthResult> {
  const cookie = await createSession({
    userId: user.id,
    email: user.email,
    phone: user.phone,
  });
  await setSessionCookie(cookie);
  return { ok: true };
}

async function upsertOtp(input: {
  channel: "phone" | "email";
  destination: string;
  purpose: "login" | "signup";
  displayName?: string;
}): Promise<{ code: string }> {
  const db = getDb();
  const code = generateOtpCode();
  const codeHash = hashOtp(code);
  // Invalidate prior unused OTPs for this destination.
  await db
    .update(authOtps)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(authOtps.destination, input.destination),
        isNull(authOtps.consumedAt),
      ),
    );
  await db.insert(authOtps).values({
    channel: input.channel,
    destination: input.destination,
    purpose: input.purpose,
    codeHash,
    displayName: input.displayName ?? null,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });
  return { code };
}

export async function requestPhoneOtp(input: {
  phone: string;
  displayName?: string;
  intent?: "login" | "signup";
}): Promise<AuthResult> {
  const gate = authConfigured();
  if (gate) return gate;

  const phone = normalizeGhPhone(input.phone);
  if (!phone) return { ok: false, error: "Enter a valid Ghana phone number" };

  const limit = rateLimit(`otp:phone:${phone}`, { capacity: 5, refillPerSec: 0.05 });
  if (!limit.ok) return { ok: false, error: "Too many codes requested. Try again shortly." };

  const { code } = await upsertOtp({
    channel: "phone",
    destination: phone,
    purpose: input.intent === "signup" ? "signup" : "login",
    displayName: input.displayName,
  });

  await sendSms({
    to: phone,
    body: `Your SBBS sign-in code is ${code}. Do not share it. Expires in 10 minutes.`,
    kind: "auth.otp",
  });

  return { ok: true };
}

export async function verifyPhoneOtp(input: {
  phone: string;
  code: string;
  displayName?: string;
}): Promise<AuthResult> {
  const gate = authConfigured();
  if (gate) return gate;

  const phone = normalizeGhPhone(input.phone);
  if (!phone) return { ok: false, error: "Invalid phone" };
  if (!/^\d{6}$/.test(input.code)) return { ok: false, error: "Enter the 6-digit code" };

  const db = getDb();
  const [otp] = await db
    .select()
    .from(authOtps)
    .where(
      and(
        eq(authOtps.destination, phone),
        eq(authOtps.channel, "phone"),
        isNull(authOtps.consumedAt),
        gt(authOtps.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(authOtps.createdAt))
    .limit(1);

  if (!otp) return { ok: false, error: "Code expired. Request a new one." };
  if (otp.attempts >= MAX_OTP_ATTEMPTS) {
    return { ok: false, error: "Too many attempts. Request a new code." };
  }

  if (otp.codeHash !== hashOtp(input.code)) {
    await db
      .update(authOtps)
      .set({ attempts: otp.attempts + 1 })
      .where(eq(authOtps.id, otp.id));
    return { ok: false, error: "Invalid code" };
  }

  await db
    .update(authOtps)
    .set({ consumedAt: new Date() })
    .where(eq(authOtps.id, otp.id));

  let [cred] = await db
    .select()
    .from(authCredentials)
    .where(eq(authCredentials.phone, phone))
    .limit(1);

  if (!cred) {
    const userId = randomUUID();
    const name =
      input.displayName || otp.displayName || `User ${phone.slice(-4)}`;
    await db.insert(profiles).values({
      id: userId,
      phone,
      displayName: name,
      role: "buyer",
    });
    await db.insert(authCredentials).values({
      userId,
      phone,
      phoneConfirmedAt: new Date(),
    });
    cred = {
      userId,
      email: null,
      phone,
      passwordHash: null,
      emailConfirmedAt: null,
      phoneConfirmedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  } else if (!cred.phoneConfirmedAt) {
    await db
      .update(authCredentials)
      .set({ phoneConfirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(authCredentials.userId, cred.userId));
  }

  await issueSession({ id: cred.userId, phone, email: cred.email });
  await ensureProfile({ displayName: input.displayName || otp.displayName || undefined }).catch(
    () => {},
  );
  return { ok: true };
}

export async function requestEmailOtp(input: {
  email: string;
  displayName?: string;
  intent?: "login" | "signup";
}): Promise<AuthResult> {
  const gate = authConfigured();
  if (gate) return gate;

  const email = input.email.trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) {
    return { ok: false, error: "Enter a valid email" };
  }

  const limit = rateLimit(`otp:email:${email}`, { capacity: 5, refillPerSec: 0.05 });
  if (!limit.ok) return { ok: false, error: "Too many codes requested. Try again shortly." };

  const { code } = await upsertOtp({
    channel: "email",
    destination: email,
    purpose: input.intent === "signup" ? "signup" : "login",
    displayName: input.displayName,
  });

  if (isEmailLive) {
    await sendEmail({
      to: email,
      subject: "Your SBBS sign-in code",
      html: `<p>Your SBBS sign-in code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. Do not share it.</p>`,
      tags: [{ name: "event", value: "auth.otp" }],
    });
  } else {
    console.log(`[auth:otp:email:stub] ${email} => ${code}`);
  }

  return { ok: true };
}

export async function verifyEmailOtp(input: {
  email: string;
  code: string;
  displayName?: string;
}): Promise<AuthResult> {
  const gate = authConfigured();
  if (gate) return gate;

  const email = input.email.trim().toLowerCase();
  if (!/^\d{6}$/.test(input.code)) return { ok: false, error: "Enter the 6-digit code" };

  const db = getDb();
  const [otp] = await db
    .select()
    .from(authOtps)
    .where(
      and(
        eq(authOtps.destination, email),
        eq(authOtps.channel, "email"),
        isNull(authOtps.consumedAt),
        gt(authOtps.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(authOtps.createdAt))
    .limit(1);

  if (!otp) return { ok: false, error: "Code expired. Request a new one." };
  if (otp.attempts >= MAX_OTP_ATTEMPTS) {
    return { ok: false, error: "Too many attempts. Request a new code." };
  }
  if (otp.codeHash !== hashOtp(input.code)) {
    await db
      .update(authOtps)
      .set({ attempts: otp.attempts + 1 })
      .where(eq(authOtps.id, otp.id));
    return { ok: false, error: "Invalid code" };
  }

  await db
    .update(authOtps)
    .set({ consumedAt: new Date() })
    .where(eq(authOtps.id, otp.id));

  let [cred] = await db
    .select()
    .from(authCredentials)
    .where(eq(authCredentials.email, email))
    .limit(1);

  if (!cred) {
    const userId = randomUUID();
    const name =
      input.displayName || otp.displayName || email.split("@")[0] || "New user";
    await db.insert(profiles).values({
      id: userId,
      email,
      displayName: name,
      role: "buyer",
    });
    await db.insert(authCredentials).values({
      userId,
      email,
      emailConfirmedAt: new Date(),
    });
    cred = {
      userId,
      email,
      phone: null,
      passwordHash: null,
      emailConfirmedAt: new Date(),
      phoneConfirmedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  } else if (!cred.emailConfirmedAt) {
    await db
      .update(authCredentials)
      .set({ emailConfirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(authCredentials.userId, cred.userId));
  }

  await issueSession({ id: cred.userId, email, phone: cred.phone });
  await ensureProfile({ displayName: input.displayName || otp.displayName || undefined }).catch(
    () => {},
  );
  return { ok: true };
}

export async function signInWithPassword(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const gate = authConfigured();
  if (gate) return gate;

  const email = input.email.trim().toLowerCase();
  const limit = rateLimit(`auth:pw:${email}`, { capacity: 10, refillPerSec: 0.1 });
  if (!limit.ok) return { ok: false, error: "Too many attempts. Try again shortly." };

  const db = getDb();
  const [cred] = await db
    .select()
    .from(authCredentials)
    .where(eq(authCredentials.email, email))
    .limit(1);

  if (!cred?.passwordHash) {
    return { ok: false, error: "Invalid email or password" };
  }
  const ok = await bcrypt.compare(input.password, cred.passwordHash);
  if (!ok) return { ok: false, error: "Invalid email or password" };

  await issueSession({ id: cred.userId, email: cred.email, phone: cred.phone });
  await ensureProfile({}).catch(() => {});
  return { ok: true };
}

export async function signUpWithPassword(input: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<AuthResult> {
  const gate = authConfigured();
  if (gate) return gate;

  const email = input.email.trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) {
    return { ok: false, error: "Enter a valid email" };
  }
  if (input.password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters" };
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(authCredentials)
    .where(eq(authCredentials.email, email))
    .limit(1);
  if (existing) return { ok: false, error: "An account with this email already exists" };

  const userId = randomUUID();
  const passwordHash = await bcrypt.hash(input.password, 12);
  const name = input.displayName || email.split("@")[0] || "New user";

  await db.insert(profiles).values({
    id: userId,
    email,
    displayName: name,
    role: "buyer",
  });
  await db.insert(authCredentials).values({
    userId,
    email,
    passwordHash,
    emailConfirmedAt: new Date(),
  });

  await issueSession({ id: userId, email });
  await ensureProfile({ displayName: name }).catch(() => {});
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  const claims = await getSessionClaims();
  if (claims?.sid) await revokeSession(claims.sid).catch(() => {});
  await clearSessionCookie();
}
