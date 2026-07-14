import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hashContributionNetworkAddress } from "./abuse";

describe("contribution abuse keys", () => {
  const request = new Request("https://salarypadi.com/contribute", {
    headers: { "x-nf-client-connection-ip": "203.0.113.8" },
  });

  it("is stable during one day and contains no raw address", () => {
    const first = hashContributionNetworkAddress(
      request,
      "test-secret",
      new Date("2026-07-14T01:00:00Z"),
    );
    const second = hashContributionNetworkAddress(
      request,
      "test-secret",
      new Date("2026-07-14T23:59:00Z"),
    );

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain("203.0.113.8");
  });

  it("rotates at the daily privacy boundary", () => {
    expect(
      hashContributionNetworkAddress(
        request,
        "test-secret",
        new Date("2026-07-14T23:59:59Z"),
      ),
    ).not.toBe(
      hashContributionNetworkAddress(
        request,
        "test-secret",
        new Date("2026-07-15T00:00:00Z"),
      ),
    );
  });

  it("does not trust caller-controlled forwarding headers", () => {
    const now = new Date("2026-07-14T12:00:00Z");
    const first = new Request("https://salarypadi.com/contribute", {
      headers: { "x-forwarded-for": "203.0.113.8" },
    });
    const second = new Request("https://salarypadi.com/contribute", {
      headers: { "x-forwarded-for": "198.51.100.2" },
    });

    expect(hashContributionNetworkAddress(first, "test-secret", now)).toBe(
      hashContributionNetworkAddress(second, "test-secret", now),
    );
  });
});
