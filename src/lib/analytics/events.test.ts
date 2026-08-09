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

  it("rejects a prohibited property at the trackEvent boundary too", () => {
    expect(() => trackEvent("job_view", { offer_amount: 1_000_000 })).toThrow(
      /prohibited/,
    );
  });
});

describe("what actually travels", () => {
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

  it("transmits only the event name and pathname, never the properties", () => {
    // Even accepted, privacy-safe dimensions stay local: the wire format is
    // {event_name, path} and nothing else. A regression that started
    // serialising properties would widen what the server could ever store.
    trackEvent("job_search", { country_code: "NG", result_count: 12 });
    const body = vi.mocked(fetch).mock.calls[0]?.[1]?.body;
    expect(JSON.parse(String(body))).toEqual({
      event_name: "job_search",
      path: "/jobs/example",
    });
  });
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
