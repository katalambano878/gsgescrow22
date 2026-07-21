import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { eq, and, isNull, gt } from "drizzle-orm";
import { env, isAuthLive, isDbLive } from "@/lib/env";
import { getDb } from "@/lib/db/client";
import { authSessions } from "@/lib/db/schema";

import { SESSION_COOKIE } from "./session-edge";
export { SESSION_COOKIE };

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type SessionClaims = {
  sub: string;
  sid: string;
  email?: string | null;
  phone?: string | null;
};

function secretKey(): Uint8Array {
  const s = env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters");
  }
  return new TextEncoder().encode(s);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOtp(code: string): string {
  return createHash("sha256").update(`otp:${code}:${env.AUTH_SECRET ?? ""}`).digest("hex");
}

/** Create a DB session row + signed JWT cookie value. */
export async function createSession(input: {
  userId: string;
  email?: string | null;
  phone?: string | null;
}): Promise<string> {
  if (!isAuthLive || !isDbLive) {
    throw new Error("Auth is not configured");
  }
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const db = getDb();
  const [row] = await db
    .insert(authSessions)
    .values({
      userId: input.userId,
      tokenHash,
      expiresAt,
    })
    .returning();

  const jwt = await new SignJWT({
    sid: row.id,
    email: input.email ?? null,
    phone: input.phone ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.userId)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secretKey());

  // Embed raw token in cookie payload so we can hash-check the DB row.
  return `${jwt}.${raw}`;
}

export async function setSessionCookie(cookieValue: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function readSessionFromCookie(
  cookieValue: string | undefined,
): Promise<SessionClaims | null> {
  if (!cookieValue || !isAuthLive) return null;
  const lastDot = cookieValue.lastIndexOf(".");
  if (lastDot < 0) return null;
  // JWT itself contains dots — split off the trailing raw token after the JWT.
  // Format: <jwt-header>.<jwt-payload>.<jwt-sig>.<raw>
  const parts = cookieValue.split(".");
  if (parts.length < 4) return null;
  const raw = parts[parts.length - 1]!;
  const jwt = parts.slice(0, -1).join(".");

  try {
    const { payload } = await jwtVerify(jwt, secretKey());
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    const sid = typeof payload.sid === "string" ? payload.sid : null;
    if (!sub || !sid) return null;

    if (!isDbLive) return null;
    const db = getDb();
    const [session] = await db
      .select()
      .from(authSessions)
      .where(
        and(
          eq(authSessions.id, sid),
          eq(authSessions.tokenHash, hashToken(raw)),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!session || session.userId !== sub) return null;

    return {
      sub,
      sid,
      email: (payload.email as string | null | undefined) ?? null,
      phone: (payload.phone as string | null | undefined) ?? null,
    };
  } catch {
    return null;
  }
}

export async function getSessionClaims(): Promise<SessionClaims | null> {
  const jar = await cookies();
  return readSessionFromCookie(jar.get(SESSION_COOKIE)?.value);
}

export async function revokeSession(sessionId: string): Promise<void> {
  if (!isDbLive) return;
  const db = getDb();
  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(eq(authSessions.id, sessionId));
}
