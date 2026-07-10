import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "@/lib/env";

describe("server environment", () => {
  it("uses a loopback default only outside production", () => {
    expect(
      parseServerEnvironment({ NODE_ENV: "development" }).NEXT_PUBLIC_APP_URL,
    ).toBe("http://localhost:3000");
  });

  it("requires an explicit canonical origin in production", () => {
    expect(() => parseServerEnvironment({ NODE_ENV: "production" })).toThrow(
      /explicitly configured/,
    );
  });

  it.each([
    "http://salarypadi.test",
    "https://localhost:3000",
    "https://[::1]:3000",
  ])("rejects an unsafe production origin: %s", (NEXT_PUBLIC_APP_URL) => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL,
      }),
    ).toThrow(/HTTPS and a non-loopback host/);
  });

  it("accepts an explicit HTTPS production origin", () => {
    expect(
      parseServerEnvironment({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://salarypadi.test",
      }).NEXT_PUBLIC_APP_URL,
    ).toBe("https://salarypadi.test");
  });

  it("rejects a different Supabase project in production", () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://salarypadi.test",
        NEXT_PUBLIC_SUPABASE_URL: "https://zpclagtgczsygrgztlts.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
      }),
    ).toThrow(/bxelrhklsznmpksgrqep/);
  });

  it("rejects an unapproved AfroTools credential destination", () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://salarypadi.test",
        AFROTOOLS_API_BASE: "https://example.com/api/v1",
        AFROTOOLS_API_KEY: "secret-test-key",
      }),
    ).toThrow(/afrotools\.com/);
  });

  it("rejects a weak internal source-refresh token", () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "development",
        JOB_SOURCE_SYNC_TOKEN: "too-short",
      }),
    ).toThrow(/>=32/);
  });
});
