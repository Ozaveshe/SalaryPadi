import { describe, expect, it } from "vitest";

import { assertPrivacySafeAnalytics, trackEvent } from "./events";

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
