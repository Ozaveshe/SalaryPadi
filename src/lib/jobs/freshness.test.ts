import { describe, expect, it } from "vitest";

import { sourceResponseCheckedAt } from "@/lib/jobs/freshness";

describe("source response freshness", () => {
  const requestedAt = new Date("2026-07-10T12:00:00.000Z");

  it("preserves the cached upstream response time", () => {
    const headers = new Headers({ Date: "Fri, 10 Jul 2026 06:00:00 GMT" });
    expect(sourceResponseCheckedAt(headers, requestedAt)).toBe(
      "2026-07-10T06:00:00.000Z",
    );
  });

  it("uses cache age when the source omitted its date", () => {
    const headers = new Headers({ Age: "3600" });
    expect(sourceResponseCheckedAt(headers, requestedAt)).toBe(
      "2026-07-10T11:00:00.000Z",
    );
  });

  it("does not trust an invalid or implausibly future source date", () => {
    expect(
      sourceResponseCheckedAt(
        new Headers({ Date: "Fri, 10 Jul 2026 18:00:00 GMT" }),
        requestedAt,
      ),
    ).toBe(requestedAt.toISOString());
  });
});
