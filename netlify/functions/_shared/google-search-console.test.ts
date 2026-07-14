import { describe, expect, it } from "vitest";

import { sanitizeSearchConsoleQuery } from "./google-search-console";

describe("Search Console topic signal privacy", () => {
  it("keeps useful aggregate queries and rejects likely personal data", () => {
    expect(sanitizeSearchConsoleQuery("  remote jobs nigeria  ")).toBe(
      "remote jobs nigeria",
    );
    expect(sanitizeSearchConsoleQuery("person@example.com jobs")).toBeNull();
    expect(sanitizeSearchConsoleQuery("call 08012345678 jobs")).toBeNull();
    expect(sanitizeSearchConsoleQuery("a")).toBeNull();
  });
});
