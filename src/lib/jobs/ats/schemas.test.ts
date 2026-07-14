import { describe, expect, it } from "vitest";

import { greenhouseJobSchema } from "./schemas";

const job = {
  id: 123,
  title: "Platform Engineer",
  updated_at: "2026-07-14T00:00:00Z",
  location: { name: "Remote" },
  absolute_url: "https://boards.greenhouse.io/example/jobs/123",
};

describe("ATS provider schemas", () => {
  it("accepts a provider job with an HTTPS destination", () => {
    expect(greenhouseJobSchema.safeParse(job).success).toBe(true);
  });

  it.each([
    "http://boards.greenhouse.io/example/jobs/123",
    "javascript:alert(1)",
  ])("rejects a non-HTTPS provider destination %s", (absoluteUrl) => {
    expect(
      greenhouseJobSchema.safeParse({ ...job, absolute_url: absoluteUrl })
        .success,
    ).toBe(false);
  });
});
