import { redirect } from "next/navigation";
import { getDb } from "../db/client";
import { profiles } from "../db/schema";
import { eq } from "drizzle-orm";
import { isAuthLive, isDbLive } from "../env";
import type { Profile } from "../db/schema";
import { getSessionClaims } from "./cookies";

export type SessionUser = {
  id: string;
  email: string | null;
  phone: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const claims = await getSessionClaims();
  if (!claims) return null;
  return {
    id: claims.sub,
    email: claims.email ?? null,
    phone: claims.phone ?? null,
  };
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const user = await getSessionUser();
  if (!user || !isDbLive) return null;
  const db = getDb();
  const rows = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  return rows[0] ?? null;
}

export type Role = "buyer" | "seller" | "rider" | "admin" | "superadmin" | "approver";

export async function requireUser(redirectTo = "/login"): Promise<SessionUser> {
  if (!isAuthLive) {
    redirect(`${redirectTo}?reason=auth-not-configured`);
  }
  const user = await getSessionUser();
  if (!user) redirect(redirectTo);
  return user;
}

export async function requireProfile(redirectTo = "/login"): Promise<Profile> {
  const user = await requireUser(redirectTo);
  if (!isDbLive) {
    redirect(`${redirectTo}?reason=db-not-configured`);
  }
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);
    if (!rows[0]) redirect(`${redirectTo}?reason=no-profile`);
    return rows[0];
  } catch (err) {
    const message = (err as { digest?: string; message?: string })?.digest ?? "";
    if (typeof message === "string" && message.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    console.error("[auth] requireProfile DB failure:", err);
    redirect(`${redirectTo}?reason=db-error`);
  }
}

export async function requireRole(
  allowed: Role | Role[],
  redirectTo = "/login",
): Promise<Profile> {
  const profile = await requireProfile(redirectTo);
  const roles = Array.isArray(allowed) ? allowed : [allowed];
  const isAdmin = profile.role === "admin" || profile.role === "superadmin";
  const explicit = roles.includes(profile.role as Role);
  const adminWildcard = roles.some((r) => r === "admin" || r === "superadmin");
  if (!explicit && !(adminWildcard && isAdmin)) {
    redirect("/hub?reason=forbidden");
  }
  return profile;
}

export function isAdminRole(role?: string | null): boolean {
  return role === "admin" || role === "superadmin";
}
