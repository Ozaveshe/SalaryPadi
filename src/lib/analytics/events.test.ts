import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics/google", () => ({
  isGoogleAnalyticsEnabled: vi.fn(() => false),
  sendGoogleAnalyticsEvent: vi.fn(),
}));

import { assertPrivacySafeAnalytics, trackEvent } from "./events";
import { isGoogleAnalyticsEnabled, sendGoogleAnalyticsEvent } from "./google";

describe("privacy-safe analytics", () => {
  it("accepts coarse non-personal dimensions", () => {
    expect(() =>
      trackEvent("job_search", { country_code: "NG", result_count: 12 }),
    ).not.toThrow();
  });

  it("accepts the consent-gated page view event without properties", () => {
    expect(() => trackEvent("page_view")).not.toThrow();
  });

  it.each(["salary_amount", "review_text", "email", "private_note"])(
    "rejects prohibited property %s",
    (key) => {
      expect(() => assertPrivacySafeAnalytics({ [key]: "secret" })).toThrow(
        /prohibited/,
      );
    },
  );
});

describe("Google Analytics consent handoff", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { pathname: "/jobs/example" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not call the Google event sink before the loader grants consent", () => {
    vi.mocked(isGoogleAnalyticsEnabled).mockReturnValue(false);

    trackEvent("job_view");

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      "/api/analytics/events",
      expect.objectContaining({
        cache: "no-store",
        credentials: "omit",
        keepalive: true,
        redirect: "error",
      }),
    );
    expect(sendGoogleAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("calls the Google event sink after the loader grants consent", () => {
    vi.mocked(isGoogleAnalyticsEnabled).mockReturnValue(true);

    trackEvent("job_view");

    expect(sendGoogleAnalyticsEvent).toHaveBeenCalledWith("job_view");
  });
});
