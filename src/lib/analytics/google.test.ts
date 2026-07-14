import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearGoogleAnalyticsCookies,
  isGoogleAnalyticsEnabled,
  isGoogleAnalyticsRouteAllowed,
  sendGoogleAnalyticsEvent,
  sendGoogleAnalyticsPageView,
  setGoogleAnalyticsEnabled,
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps the event sink closed until the consent-gated loader enables it", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", {
      __salarypadiGoogleAnalyticsEnabled: false,
      gtag,
      location: { pathname: "/jobs/example" },
    });

    expect(isGoogleAnalyticsEnabled()).toBe(false);
    sendGoogleAnalyticsEvent("job_view");
    expect(gtag).not.toHaveBeenCalled();

    window.__salarypadiGoogleAnalyticsEnabled = true;
    expect(isGoogleAnalyticsEnabled()).toBe(true);
    sendGoogleAnalyticsEvent("job_view");
    expect(gtag).toHaveBeenCalledWith("event", "job_view");
  });

  it("keeps feature events closed on private routes after consent", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", {
      __salarypadiGoogleAnalyticsEnabled: true,
      gtag,
      location: { pathname: "/account" },
    });

    sendGoogleAnalyticsEvent("job_view");

    expect(gtag).not.toHaveBeenCalled();
  });

  it("updates consent and the GA disable flag without enabling advertising", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", {
      __salarypadiGoogleAnalyticsEnabled: false,
      gtag,
    });

    setGoogleAnalyticsEnabled("G-ABC123DEF4", true);

    expect(window.__salarypadiGoogleAnalyticsEnabled).toBe(true);
    expect(Reflect.get(window, "ga-disable-G-ABC123DEF4")).toBe(false);
    expect(gtag).toHaveBeenCalledWith("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });

    setGoogleAnalyticsEnabled("G-ABC123DEF4", false);
    expect(window.__salarypadiGoogleAnalyticsEnabled).toBe(false);
    expect(Reflect.get(window, "ga-disable-G-ABC123DEF4")).toBe(true);
  });

  it("clears only Google Analytics cookies", () => {
    const writes: string[] = [];
    vi.stubGlobal("document", {
      get cookie() {
        return "session=keep; _ga=GA1.1.123; _ga_ABC=GS1.1.456";
      },
      set cookie(value: string) {
        writes.push(value);
      },
    });

    clearGoogleAnalyticsCookies();

    expect(writes).toEqual([
      "_ga=; Max-Age=0; Path=/; SameSite=Lax",
      "_ga_ABC=; Max-Age=0; Path=/; SameSite=Lax",
    ]);
  });

  it("sends a coarse public page view and excludes private pages", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", {
      __salarypadiGoogleAnalyticsEnabled: true,
      gtag,
      location: {
        origin: "https://salarypadi.com",
        pathname: "/jobs/platform-engineer",
      },
    });
    vi.stubGlobal("document", { title: "Platform Engineer" });

    sendGoogleAnalyticsPageView("/jobs/platform-engineer");
    expect(gtag).toHaveBeenCalledWith("event", "page_view", {
      page_location: "https://salarypadi.com/jobs/platform-engineer",
      page_path: "/jobs/platform-engineer",
      page_title: "Platform Engineer",
    });

    gtag.mockClear();
    sendGoogleAnalyticsPageView("/privacy/requests");
    expect(gtag).not.toHaveBeenCalled();
  });

  it("keeps every browser-only helper safe during server rendering", () => {
    expect(isGoogleAnalyticsEnabled()).toBe(false);
    expect(() => setGoogleAnalyticsEnabled("G-ABC123DEF4", true)).not.toThrow();
    expect(() => clearGoogleAnalyticsCookies()).not.toThrow();
    expect(() => sendGoogleAnalyticsEvent("job_view")).not.toThrow();
    expect(() => sendGoogleAnalyticsPageView("/jobs")).not.toThrow();
  });
});
