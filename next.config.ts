import type { NextConfig } from "next";

const privateNoStoreSources = [
  "/account/:path*",
  "/saved/:path*",
  "/applications/:path*",
  "/alerts/:path*",
  "/admin/:path*",
  "/auth/mfa-required",
  "/privacy/requests/:path*",
  "/company-intelligence/requests/:path*",
  "/contribute/:path*",
  "/post-a-job",
  "/companies/:slug/claim",
  "/companies/:slug/respond",
] as const;

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
        ],
      },
      ...privateNoStoreSources.map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      })),
    ];
  },
};

export default nextConfig;
