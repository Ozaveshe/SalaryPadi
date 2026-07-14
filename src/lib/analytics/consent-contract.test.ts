import { describe, expect, it } from "vitest";

import {
  analyticsConsentRequestSchema,
  analyticsConsentResponseSchema,
} from "@/lib/analytics/consent-contract";

describe("analytics consent contract", () => {
  it("accepts only an explicit boolean choice", () => {
    expect(
      analyticsConsentRequestSchema.safeParse({ allowed: true }).success,
    ).toBe(true);
    expect(
      analyticsConsentRequestSchema.safeParse({ allowed: "true" }).success,
    ).toBe(false);
    expect(
      analyticsConsentRequestSchema.safeParse({ allowed: true, user: "x" })
        .success,
    ).toBe(false);
  });

  it("rejects malformed acknowledgement payloads", () => {
    expect(
      analyticsConsentResponseSchema.safeParse({ allowed: true }).success,
    ).toBe(true);
    expect(
      analyticsConsentResponseSchema.safeParse({ status: "saved" }).success,
    ).toBe(false);
  });
});
