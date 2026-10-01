import { NextResponse, type NextRequest } from "next/server";
import { peekSessionUserId, SESSION_COOKIE } from "@/lib/auth/session-edge";

const BYPASS_COOKIE = "sbbs_maint_bypass";

function maintenanceEnabled(): boolean {
  const v = process.env.MAINTENANCE_MODE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function hasMaintenanceBypass(req: NextRequest): boolean {
  const secret = process.env.MAINTENANCE_BYPASS_SECRET?.trim();
  if (!secret) return false;
  if (req.cookies.get(BYPASS_COOKIE)?.value === secret) return true;
  const key = req.nextUrl.searchParams.get("maint_key");
  return Boolean(key && key === secret);
}

function isMaintenanceExempt(pathname: string): boolean {
  return (
    pathname === "/maintenance" ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/cron") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.png" ||
    pathname === "/apple-icon.png" ||
    pathname.startsWith("/brand/") ||
    pathname.startsWith("/_next/")
  );
}

/**
 * Session proxy (Next.js middleware replacement).
 *
 * Responsibilities:
 *   0. Optional full-site maintenance gate (MAINTENANCE_MODE).
 *   1. Peek the signed session cookie on matched requests.
 *   2. Edge-gate `/admin/*` and `/hub/*` — if there's no session, redirect
 *      to /login. Server components still do their own role checks inside.
 *
 * Public routes (marketing, track, badge, api/webhooks, api/cron) are not
 * touched — they must be anonymous-accessible — except during maintenance.
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (maintenanceEnabled() && !isMaintenanceExempt(pathname)) {
    if (!hasMaintenanceBypass(req)) {
      const dest = req.nextUrl.clone();
      dest.pathname = "/maintenance";
      dest.search = "";
      const res = NextResponse.redirect(dest, 307);
      res.headers.set("Retry-After", "3600");
      res.headers.set("Cache-Control", "no-store");
      return res;
    }

    // Valid bypass key in query → persist cookie and continue cleanly.
    const secret = process.env.MAINTENANCE_BYPASS_SECRET?.trim();
    const key = req.nextUrl.searchParams.get("maint_key");
    if (secret && key === secret) {
      const clean = req.nextUrl.clone();
      clean.searchParams.delete("maint_key");
      const res = NextResponse.redirect(clean);
      res.cookies.set(BYPASS_COOKIE, secret, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 12,
      });
      return res;
    }
  }

  const res = NextResponse.next({ request: req });

  const cookieValue = req.cookies.get(SESSION_COOKIE)?.value;
  const userId = await peekSessionUserId(cookieValue);

  const isHub = pathname.startsWith("/hub");
  const isAdmin = pathname.startsWith("/admin") && !pathname.startsWith("/admin-login");

  if ((isHub || isAdmin) && !userId) {
    const redirect = req.nextUrl.clone();
    redirect.pathname = isAdmin ? "/admin-login" : "/login";
    redirect.search = "";
    redirect.searchParams.set("next", pathname + (search || ""));
    return NextResponse.redirect(redirect);
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|opengraph-image|api/webhooks|api/cron|api/track|api/badge|api/health|api/storage).*)",
  ],
};
