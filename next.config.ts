import type { NextConfig } from "next";

// Relative, not aliased: next.config.ts is compiled outside the app's module
// resolution. The module is dependency-free so it loads safely here.
import { PROTECTED_NO_STORE_SOURCES } from "./src/lib/security/protected-paths";

/**
 * Netlify exposes COMMIT_REF/CONTEXT/BRANCH/BUILD_ID to the BUILD, not to the
 * function runtime. Baking them into the bundle here is what lets
 * /api/build-info report the deployed commit, which production acceptance
 * relies on to prove it tested the right build.
 */
const buildIdentity = {
  SALARYPADI_BUILD_COMMIT: process.env.COMMIT_REF ?? "",
  SALARYPADI_BUILD_CONTEXT: process.env.CONTEXT ?? "",
  SALARYPADI_BUILD_BRANCH: process.env.BRANCH ?? "",
  SALARYPADI_BUILD_ID: process.env.BUILD_ID ?? "",
};

const nextConfig: NextConfig = {
  env: buildIdentity,
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },
  outputFileTracingIncludes: {
    "/*": ["./public/brand/salarypadi-logo-dark.svg"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(), usb=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          // Only in production: sending HSTS from a loopback dev server would
          // pin localhost to HTTPS for every other project on the machine.
          // `preload` is deliberately omitted — it is a separate, effectively
          // irreversible submission that should be an explicit decision.
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
      ...PROTECTED_NO_STORE_SOURCES.map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      })),
    ];
  },
};

export default nextConfig;
