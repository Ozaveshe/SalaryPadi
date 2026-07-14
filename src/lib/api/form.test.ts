import { describe, expect, it } from "vitest";

import { readApiForm } from "@/lib/api/form";

describe("API form boundary", () => {
  it("returns parsed bounded form data", async () => {
    const result = await readApiForm(
      new Request("https://salarypadi.test/form", {
        method: "POST",
        body: new URLSearchParams({ role: "Engineer" }),
      }),
      1_024,
      { invalidMessage: "Invalid form." },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.get("role")).toBe("Engineer");
  });

  it("returns a no-store 413 for an oversized actual body", async () => {
    const result = await readApiForm(
      new Request("https://salarypadi.test/form", {
        method: "POST",
        body: new URLSearchParams({ value: "x".repeat(1_024) }),
      }),
      64,
      { invalidMessage: "Invalid form.", tooLargeMessage: "Form too large." },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(413);
    expect(result.response.headers.get("cache-control")).toBe("no-store");
    await expect(result.response.json()).resolves.toEqual({
      error: "Form too large.",
    });
  });

  it("returns a no-store 400 for malformed form content", async () => {
    const result = await readApiForm(
      new Request("https://salarypadi.test/form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      64,
      { invalidMessage: "Invalid form." },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    await expect(result.response.json()).resolves.toEqual({
      error: "Invalid form.",
    });
  });
});
