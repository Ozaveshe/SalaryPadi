import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("company logo route", () => {
  it("rejects slugs outside the manifest allowlist", async () => {
    const response = await GET(
      new Request("https://salarypadi.test/api/company-logos/not-listed"),
      {
        params: Promise.resolve({ slug: "not-listed" }),
      },
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "company_logo_not_allowlisted",
    });
  });

  it("serves an online fallback for every allowlisted company without provider configuration", async () => {
    const response = await GET(
      new Request("https://salarypadi.test/api/company-logos/safaricom"),
      {
        params: Promise.resolve({ slug: "safaricom" }),
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
    expect(response.headers.get("x-salarypadi-logo-state")).toBe(
      "monogram_fallback",
    );
  });
});
