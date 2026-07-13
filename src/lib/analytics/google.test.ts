import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isGoogleAnalyticsEnabled,
  isGoogleAnalyticsRouteAllowed,
  sendGoogleAnalyticsEvent,
} from "@/lib/analytics/google";

describe("Google Analytics route boundary", () => {
  it.each([
    "/account",
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the event sink closed until the consent-gated loader enables it", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", {
      __salarypadiGoogleAnalyticsEnabled: false,
      gtag,
    });

    expect(isGoogleAnalyticsEnabled()).toBe(false);
    sendGoogleAnalyticsEvent("job_view");
    expect(gtag).not.toHaveBeenCalled();

    window.__salarypadiGoogleAnalyticsEnabled = true;
    expect(isGoogleAnalyticsEnabled()).toBe(true);
    sendGoogleAnalyticsEvent("job_view");
    expect(gtag).toHaveBeenCalledWith("event", "job_view");
  });
});
