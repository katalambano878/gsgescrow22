import type { NextConfig } from "next";

// Baseline security headers applied to every response. Kept conservative so
// they don't break Supabase auth or Moolre redirects. CSP is intentionally
// not set as a static header — Next.js inline scripts (App Router runtime,
// Turbopack hot-reload in dev) require nonce-based or relaxed CSP, which is
// out of scope for v1. HSTS is the most important one for HTTPS hardening.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // Block intrusive sensors/APIs the app does not use.
    value:
      "camera=(), microphone=(), geolocation=(), payment=(self), usb=(), magnetometer=(), gyroscope=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.sbbs.gh" }],
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Webhook endpoints must be embeddable to no one and must not be
        // cached by any intermediary.
        source: "/api/webhooks/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        // Authenticated app surfaces should never be indexed.
        source: "/(admin|hub|buy|sell)/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
