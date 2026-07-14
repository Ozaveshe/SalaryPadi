import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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

  it("allows the explicit CI-only loopback origin used by production browser tests", () => {
    expect(
      parseServerEnvironment({
        NODE_ENV: "production",
        CI: "true",
        SALARYPADI_LOCAL_E2E: "true",
        NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
      }).NEXT_PUBLIC_APP_URL,
    ).toBe("http://127.0.0.1:3100");
  });

  it("does not honor the local E2E origin flag outside CI", () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "production",
        SALARYPADI_LOCAL_E2E: "true",
        NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
      }),
    ).toThrow(/HTTPS and a non-loopback host/);
  });

  it.each([
    "ftp://salarypadi.test",
    "https://user:secret@salarypadi.test",
    "https://salarypadi.test/app",
    "https://salarypadi.test?preview=true",
    "https://salarypadi.test#preview",
  ])(
    "rejects an executable URL that is not an application origin: %s",
    (url) => {
      expect(() =>
        parseServerEnvironment({
          NODE_ENV: "development",
          NEXT_PUBLIC_APP_URL: url,
        }),
      ).toThrow(/credential-free HTTP\(S\) origin/);
    },
  );

  it("accepts a GA4 measurement ID", () => {
    expect(
      parseServerEnvironment({
        NODE_ENV: "development",
        NEXT_PUBLIC_GOOGLE_ANALYTICS_ID: "G-ABC123DEF4",
      }).NEXT_PUBLIC_GOOGLE_ANALYTICS_ID,
    ).toBe("G-ABC123DEF4");
  });

  it("rejects a malformed Google Analytics ID", () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "development",
        NEXT_PUBLIC_GOOGLE_ANALYTICS_ID: "UA-12345-6",
      }),
    ).toThrow(/GA4 measurement ID/);
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
        AFROTOOLS_API_BASE_URL: "https://example.com/api/v1",
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

  it("accepts the documented transactional mailbox formats", () => {
    expect(
      parseServerEnvironment({
        NODE_ENV: "development",
        TRANSACTIONAL_EMAIL_FROM: "SalaryPadi <updates@mail.salarypadi.com>",
        TRANSACTIONAL_EMAIL_REPLY_TO: "support@salarypadi.com",
      }),
    ).toMatchObject({
      TRANSACTIONAL_EMAIL_FROM: "SalaryPadi <updates@mail.salarypadi.com>",
      TRANSACTIONAL_EMAIL_REPLY_TO: "support@salarypadi.com",
    });
  });

  it.each([
    ["TRANSACTIONAL_EMAIL_FROM", "not-an-address"],
    [
      "TRANSACTIONAL_EMAIL_FROM",
      "SalaryPadi\nBcc: attacker@example.test <updates@mail.salarypadi.com>",
    ],
    ["TRANSACTIONAL_EMAIL_REPLY_TO", "Support <support@salarypadi.com>"],
  ] as const)("rejects an invalid %s mailbox", (name, value) => {
    expect(() =>
      parseServerEnvironment({ NODE_ENV: "development", [name]: value }),
    ).toThrow(/valid email mailbox/);
  });

  it("rejects a credential containing header-breaking whitespace", () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "development",
        RESEND_API_KEY: "valid-prefix\nforged-header",
      }),
    ).toThrow(/single bounded token/);
  });
});
