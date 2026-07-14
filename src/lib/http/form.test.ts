import { describe, expect, it } from "vitest";

import { FormBodyError, readBoundedFormData } from "@/lib/http/form";

describe("bounded form reader", () => {
  it("parses a URL-encoded form within the actual byte limit", async () => {
    const form = await readBoundedFormData(
      new Request("https://salarypadi.test/form", {
        method: "POST",
        body: new URLSearchParams({ role: "Engineer", country: "NG" }),
      }),
      1_024,
    );

    expect(Object.fromEntries(form.entries())).toEqual({
      role: "Engineer",
      country: "NG",
    });
  });

  it("parses multipart forms without bypassing the stream boundary", async () => {
    const body = new FormData();
    body.set("kind", "review");
    body.set("statement", "A bounded statement");

    const form = await readBoundedFormData(
      new Request("https://salarypadi.test/form", {
        method: "POST",
        body,
      }),
      4_096,
    );

    expect(form.get("kind")).toBe("review");
    expect(form.get("statement")).toBe("A bounded statement");
  });

  it("rejects an oversized actual stream even without Content-Length", async () => {
    await expect(
      readBoundedFormData(
        new Request("https://salarypadi.test/form", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `value=${"x".repeat(1_024)}`,
        }),
        64,
      ),
    ).rejects.toMatchObject({
      code: "too_large",
    } satisfies Partial<FormBodyError>);
  });

  it("rejects unsupported or malformed form content", async () => {
    await expect(
      readBoundedFormData(
        new Request("https://salarypadi.test/form", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
        64,
      ),
    ).rejects.toMatchObject({
      code: "invalid_form",
    } satisfies Partial<FormBodyError>);
  });
});
