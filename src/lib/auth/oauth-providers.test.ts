import { afterEach, describe, expect, it, vi } from "vitest";

import { getAuthProviderFlags } from "@/lib/env";

import {
  getAvailableOAuthProviders,
  isOAuthProvider,
  OAUTH_PROVIDERS,
} from "./oauth-providers";

vi.mock("@/lib/env", () => ({ getAuthProviderFlags: vi.fn() }));

const flags = vi.mocked(getAuthProviderFlags);

afterEach(() => {
  vi.resetAllMocks();
});

describe("social sign-in providers", () => {
  it("offers nothing until a provider is switched on", () => {
    flags.mockReturnValue({ google: false, linkedin_oidc: false });
    expect(getAvailableOAuthProviders()).toEqual([]);
  });

  it("offers only the providers this deployment enabled", () => {
    flags.mockReturnValue({ google: true, linkedin_oidc: false });
    expect(getAvailableOAuthProviders().map((p) => p.provider)).toEqual([
      "google",
    ]);
  });

  it("requests only OIDC identity scopes, never employment or contacts", () => {
    flags.mockReturnValue({ google: true, linkedin_oidc: true });
    for (const provider of getAvailableOAuthProviders()) {
      const scopes = provider.scopes.split(" ");
      expect(scopes).toContain("openid");
      // Anything beyond basic identity would let the product imply it holds
      // verified career facts that the provider never supplied.
      for (const scope of scopes) {
        expect(["openid", "email", "profile"]).toContain(scope);
      }
    }
  });

  it("uses LinkedIn's OpenID Connect slug, not the retired one", () => {
    expect(OAUTH_PROVIDERS).toContain("linkedin_oidc");
    expect(OAUTH_PROVIDERS).not.toContain("linkedin");
  });

  it("rejects anything that is not a supported provider", () => {
    expect(isOAuthProvider("google")).toBe(true);
    expect(isOAuthProvider("linkedin")).toBe(false);
    expect(isOAuthProvider("facebook")).toBe(false);
    expect(isOAuthProvider(undefined)).toBe(false);
  });
});
