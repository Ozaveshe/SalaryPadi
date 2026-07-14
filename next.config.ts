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

const nextConfig: NextConfig = {
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
