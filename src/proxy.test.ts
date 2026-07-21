import { NextRequest } from "next/server";
import {
  getRedirectUrl,
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getSupabasePublicConfig: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/env", () => ({
  getSupabasePublicConfig: mocks.getSupabasePublicConfig,
}));

import { config, isProtectedPagePath, proxy } from "./proxy";

function authenticatedClient(
  subject: unknown,
  options: { error?: unknown; throws?: Error } = {},
) {
  return {
    auth: {
      getClaims: vi.fn(async () => {
        if (options.throws) throw options.throws;
        return {
          data: {
            claims:
              subject === null || subject === undefined
                ? null
                : { sub: subject },
          },
          error: options.error ?? null,
        };
      }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSupabasePublicConfig.mockReturnValue({
    url: "https://bxelrhklsznmpksgrqep.supabase.co",
    publishableKey: "test-publishable-key",
  });
});

describe("Next proxy boundary", () => {
  it("covers every page family that performs an optimistic viewer check", () => {
    const protectedPaths = [
      "/account",
      "/saved",
      "/applications",
      "/alerts",
      "/admin/source-health",
      "/post-a-job",
      "/contribute/salary",
      "/contribute/review",
      "/contribute/interview",
      "/contribute/benefits",
      "/contribute/pay-reliability",
      "/privacy/requests",
      "/company-intelligence/requests",
      "/companies/example-ltd/claim",
      "/companies/example-ltd/respond",
      "/auth/mfa-required",
    ];
    for (const path of protectedPaths) {
      expect(isProtectedPagePath(path), path).toBe(true);
    }
    expect(isProtectedPagePath("/contribute")).toBe(false);
    expect(isProtectedPagePath("/companies/example-ltd")).toBe(false);
    expect(isProtectedPagePath("/companies/example-ltd/reviews")).toBe(false);
  });

  it("matches application pages while excluding API and static image paths", () => {
    expect(
      unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/saved" }),
    ).toBe(true);
    expect(
      unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/account" }),
    ).toBe(true);
    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig: {},
        url: "/api/analytics/events",
      }),
    ).toBe(false);
    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig: {},
        url: "/brand/social-card.png",
      }),
    ).toBe(false);
  });

  it("does not widen CSP to an unvalidated Supabase project origin", async () => {
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "https://wrongprojectref.supabase.co";
    mocks.getSupabasePublicConfig.mockReturnValue(null);
    try {
      const response = await proxy(
        new NextRequest("https://salarypadi.com/about"),
      );

      expect(response.headers.get("content-security-policy")).toContain(
        "connect-src 'self'",
      );
      expect(response.headers.get("content-security-policy")).not.toContain(
        "wrongprojectref.supabase.co",
      );
    } finally {
      if (previousUrl === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
      }
    }
  });

  it("redirects an unauthenticated protected request and preserves a safe next path", async () => {
    mocks.createServerClient.mockReturnValue(authenticatedClient(null));
    const request = new NextRequest(
      "https://salarypadi.com/saved?view=engineering",
    );

    const response = await proxy(request);

    expect(getRedirectUrl(response)).toBe(
      "https://salarypadi.com/auth/sign-in?next=%2Fsaved%3Fview%3Dengineering",
    );
    expect(response.headers.get("content-security-policy")).toMatch(
      /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/,
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("sends an unconfigured backend to sign-in, which surfaces setup state", async () => {
    mocks.getSupabasePublicConfig.mockReturnValue(null);
    const request = new NextRequest("https://salarypadi.com/saved");

    const response = await proxy(request);

    expect(getRedirectUrl(response)).toBe(
      "https://salarypadi.com/auth/sign-in?next=%2Fsaved",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("protects the account landing page", async () => {
    mocks.createServerClient.mockReturnValue(authenticatedClient(null));
    const request = new NextRequest("https://salarypadi.com/account");

    const response = await proxy(request);

    expect(getRedirectUrl(response)).toBe(
      "https://salarypadi.com/auth/sign-in?next=%2Faccount",
    );
  });

  it("allows authenticated requests and forwards the same nonce-bound CSP", async () => {
    mocks.createServerClient.mockReturnValue(
      authenticatedClient("10000000-0000-4000-8000-000000000001"),
    );
    const request = new NextRequest("https://salarypadi.com/applications");

    const response = await proxy(request);
    const policy = response.headers.get("content-security-policy");
    const nonce = policy?.match(/'nonce-([^']+)'/)?.[1];

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(nonce).toBeTruthy();
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(
      response.headers.get("x-middleware-request-content-security-policy"),
    ).toBe(policy);
  });

  it("does not admit a malformed signed subject to a protected page", async () => {
    mocks.createServerClient.mockReturnValue(
      authenticatedClient("user/../../../admin"),
    );
    const request = new NextRequest("https://salarypadi.com/saved");

    const response = await proxy(request);

    expect(response.status).toBe(503);
    expect(getRedirectUrl(response)).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.text()).resolves.toBe(
      "Authentication is temporarily unavailable.",
    );
  });

  it("keeps a claims outage distinct from an anonymous redirect", async () => {
    mocks.createServerClient.mockReturnValue(
      authenticatedClient(null, {
        error: { message: "claims backend unavailable" },
      }),
    );
    const request = new NextRequest("https://salarypadi.com/applications");

    const response = await proxy(request);

    expect(response.status).toBe(503);
    expect(getRedirectUrl(response)).toBeNull();
  });

  it("maps a thrown claims transport failure to a bounded unavailable response", async () => {
    mocks.createServerClient.mockReturnValue(
      authenticatedClient(null, {
        throws: new Error("claims transport failed"),
      }),
    );
    const request = new NextRequest("https://salarypadi.com/account");

    const response = await proxy(request);

    expect(response.status).toBe(503);
    expect(response.headers.get("content-security-policy")).toBeTruthy();
  });
});
