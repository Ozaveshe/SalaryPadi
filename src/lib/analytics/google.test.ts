import { describe, expect, it } from "vitest";

import { isGoogleAnalyticsRouteAllowed } from "@/lib/analytics/google";

describe("Google Analytics route boundary", () => {
  it.each([
    "/admin",
    "/alerts/123",
    "/applications",
    "/auth/sign-in",
    "/contribute/salary",
    "/post-a-job",
    "/privacy/requests",
    "/saved",
  ])("excludes private or sensitive route %s", (pathname) => {
    expect(isGoogleAnalyticsRouteAllowed(pathname)).toBe(false);
  });

  it.each(["/", "/jobs", "/companies/example", "/tools/take-home-pay"])(
    "allows public route %s",
    (pathname) => {
      expect(isGoogleAnalyticsRouteAllowed(pathname)).toBe(true);
    },
  );
});
