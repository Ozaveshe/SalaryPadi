import { describe, expect, it } from "vitest";

import { externalHttpsUrlSchema } from "./url-schema";

describe("external HTTPS URL schema", () => {
  it("accepts a bounded credential-free HTTPS destination", () => {
    expect(
      externalHttpsUrlSchema.parse("https://example.com/evidence?version=1"),
    ).toBe("https://example.com/evidence?version=1");
  });

  it.each([
    "http://example.com/evidence",
    "javascript:alert(1)",
    "https://user:secret@example.com/evidence",
    "https://127.0.0.1/evidence",
    "https://[::1]/evidence",
  ])("rejects unsafe external destination %s", (value) => {
    expect(externalHttpsUrlSchema.safeParse(value).success).toBe(false);
  });
});
