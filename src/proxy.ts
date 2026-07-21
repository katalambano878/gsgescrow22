import { NextResponse, type NextRequest } from "next/server";
import { peekSessionUserId, SESSION_COOKIE } from "@/lib/auth/session-edge";

/**
 * Session proxy (Next.js middleware replacement).
 *
 * Responsibilities:
 *   1. Peek the signed session cookie on matched requests.
 *   2. Edge-gate `/admin/*` and `/hub/*` — if there's no session, redirect
 *      to /login. Server components still do their own role checks inside.
 *
 * Public routes (marketing, track, badge, api/webhooks, api/cron) are not
 * touched — they must be anonymous-accessible.
 */
export async function proxy(req: NextRequest) {
  const res = NextResponse.next({ request: req });

  const cookieValue = req.cookies.get(SESSION_COOKIE)?.value;
  const userId = await peekSessionUserId(cookieValue);

  const { pathname, search } = req.nextUrl;
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
