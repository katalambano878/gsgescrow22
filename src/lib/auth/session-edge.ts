import { jwtVerify } from "jose";

export const SESSION_COOKIE = "sbbs_session";

/**
 * Edge-safe JWT peek (no DB). Full session validation still happens in RSC
 * via `getSessionClaims()`. Cookie format: `<jwt>.<rawToken>`.
 */
export async function peekSessionUserId(
  cookieValue: string | undefined,
): Promise<string | null> {
  if (!cookieValue || !process.env.AUTH_SECRET) return null;
  const parts = cookieValue.split(".");
  if (parts.length < 4) return null;
  const jwt = parts.slice(0, -1).join(".");
  try {
    const { payload } = await jwtVerify(
      jwt,
      new TextEncoder().encode(process.env.AUTH_SECRET),
    );
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
