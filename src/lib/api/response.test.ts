import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { noStoreRedirect } from "@/lib/api/response";

describe("private API responses", () => {
  it("marks mutation redirects as no-store", () => {
    const response = noStoreRedirect(
      new URL("https://salarypadi.com/applications?updated=true"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://salarypadi.com/applications?updated=true",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
