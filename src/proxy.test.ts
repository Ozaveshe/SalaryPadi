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

import { config, proxy } from "./proxy";

function authenticatedClient(subject: string | null) {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: subject ? { sub: subject } : null },
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
});
