import { describe, expect, it } from "vitest";

import { safeExternalUrl, safeRelativePath } from "@/lib/security/urls";

describe("safeRelativePath", () => {
  it("keeps an internal path, query and fragment", () => {
    expect(safeRelativePath("/jobs?q=design#results")).toBe(
      "/jobs?q=design#results",
    );
  });

  it.each([
    "https://evil.example/steal",
    "//evil.example/steal",
    "/\\evil.example/steal",
    "\\evil.example\\steal",
    "javascript:alert(1)",
    "jobs",
    "/jobs\nLocation:https://evil.example",
  ])("rejects an unsafe redirect target: %s", (value) => {
    expect(safeRelativePath(value, "/safe")).toBe("/safe");
  });

  it("normalizes traversal while staying on the application origin", () => {
    expect(safeRelativePath("/jobs/../saved")).toBe("/saved");
  });
});

describe("safeExternalUrl", () => {
  it("allows a credential-free HTTPS destination", () => {
    expect(safeExternalUrl("https://jobs.example/apply")?.hostname).toBe(
      "jobs.example",
    );
  });

  it.each([
    "http://jobs.example/apply",
    "javascript:alert(1)",
    "https://user:secret@jobs.example/apply",
    "https://localhost/apply",
    "https://localhost./apply",
    "https://recruiting.local/apply",
    "https://127.0.0.1/apply",
    "https://[::1]/apply",
    "not a URL",
  ])("rejects an unsafe external destination: %s", (value) => {
    expect(safeExternalUrl(value)).toBeNull();
  });
});
