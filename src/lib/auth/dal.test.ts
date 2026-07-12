import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T>(value: T) => value }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { getViewer, requireAdmin, requireViewer } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const mockedCreateClient = vi.mocked(createServerSupabaseClient);

function client({
  claims,
  claimsError = null,
  admin = false,
  adminError = null,
}: {
  claims?: Record<string, unknown>;
  claimsError?: unknown;
  admin?: boolean;
  adminError?: unknown;
}) {
  return {
    auth: {
      getClaims: async () => ({
        data: claims ? { claims } : null,
        error: claimsError,
      }),
    },
    schema: () => ({
      rpc: async () => ({ data: admin, error: adminError }),
    }),
  } as never;
}

describe("viewer authentication states", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps a claims outage distinct from an anonymous session", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      client({ claimsError: { message: "auth unavailable" } }),
    );

    await expect(getViewer()).resolves.toEqual({
      state: "unavailable",
      code: "claims_unavailable",
    });
  });

  it("distinguishes an unconfigured backend", async () => {
    mockedCreateClient.mockResolvedValue(null);
    await expect(getViewer()).resolves.toEqual({ state: "unconfigured" });
  });

  it("returns anonymous only when claims were read and have no subject", async () => {
    mockedCreateClient.mockResolvedValue(client({ claims: {} }));
    await expect(getViewer()).resolves.toEqual({ state: "anonymous" });
  });

  it("fails staff authorization closed without erasing the identity", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      client({
        claims: { sub: "user-1", email: "user@example.com", aal: "aal2" },
        adminError: { message: "role lookup unavailable" },
      }),
    );

    await expect(getViewer()).resolves.toEqual({
      state: "authenticated",
      id: "user-1",
      email: "user@example.com",
      isAdmin: false,
      staffRoleState: "unavailable",
      aal: "aal2",
    });
  });

  it("returns a fully verified administrator identity", async () => {
    mockedCreateClient.mockResolvedValue(
      client({
        claims: { sub: "admin-1", email: "admin@example.com", aal: "aal2" },
        admin: true,
      }),
    );
    await expect(getViewer()).resolves.toEqual({
      state: "authenticated",
      id: "admin-1",
      email: "admin@example.com",
      isAdmin: true,
      staffRoleState: "ready",
      aal: "aal2",
    });
  });

  it("does not redirect a claims outage to sign-in", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      client({ claimsError: { message: "auth unavailable" } }),
    );
    await expect(requireViewer("/saved")).rejects.toThrow(
      "Authentication state could not be verified",
    );
  });

  it("does not treat a staff-role outage as a normal access denial", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      client({
        claims: { sub: "user-1", aal: "aal2" },
        adminError: { message: "role lookup unavailable" },
      }),
    );
    await expect(requireAdmin()).rejects.toThrow(
      "Administrator access could not be verified",
    );
  });
});
