import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";

const viewerOnlySources = [
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
];

describe("private route cache policy", () => {
  it("marks every viewer-only page family private and no-store", async () => {
    const configured = (await nextConfig.headers?.()) ?? [];
    const protectedSources = configured
      .filter((entry) =>
        entry.headers.some(
          (header) =>
            header.key.toLowerCase() === "cache-control" &&
            header.value === "private, no-store",
        ),
      )
      .map((entry) => entry.source);

    expect(protectedSources).toEqual(expect.arrayContaining(viewerOnlySources));
  });
});
