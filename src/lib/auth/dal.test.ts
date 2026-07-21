import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T>(value: T) => value }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  unstable_rethrow: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { getViewer, requireAdmin, requireViewer } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect, unstable_rethrow } from "next/navigation";

const mockedCreateClient = vi.mocked(createServerSupabaseClient);
const mockedRedirect = vi.mocked(redirect);

function client({
  claims,
  claimsError = null,
  admin = false,
  adminError = null,
  claimsThrows,
  adminThrows,
}: {
  claims?: Record<string, unknown>;
  claimsError?: unknown;
  admin?: unknown;
  adminError?: unknown;
  claimsThrows?: Error;
  adminThrows?: Error;
}) {
  return {
    auth: {
      getClaims: async () => {
        if (claimsThrows) throw claimsThrows;
        return {
          data: claims ? { claims } : null,
          error: claimsError,
        };
      },
    },
    schema: () => ({
      rpc: async () => {
        if (adminThrows) throw adminThrows;
        return { data: admin, error: adminError };
      },
    }),
  } as never;
}

describe("viewer authentication states", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(unstable_rethrow).mockReset();
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

  it("does not treat a malformed subject claim as anonymous", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      client({ claims: { sub: "user/../../../admin", aal: "aal2" } }),
    );

    await expect(getViewer()).resolves.toEqual({
      state: "unavailable",
      code: "claims_unavailable",
    });
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

  it("fails staff authorization closed on a malformed RPC result", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      client({
        claims: { sub: "admin-1", email: "admin@example.com", aal: "aal2" },
        admin: "true",
      }),
    );

    await expect(getViewer()).resolves.toMatchObject({
      state: "authenticated",
      id: "admin-1",
      isAdmin: false,
      staffRoleState: "unavailable",
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

  it("sends an unconfigured backend to sign-in, which surfaces setup state", async () => {
    mockedCreateClient.mockResolvedValue(null);
    await requireViewer("/saved").catch(() => undefined);
    expect(mockedRedirect).toHaveBeenCalledWith(
      "/auth/sign-in?next=%2Fsaved",
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

  it("maps a thrown auth-client bootstrap failure to unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("auth client failed");
    mockedCreateClient.mockRejectedValue(failure);

    await expect(getViewer()).resolves.toEqual({
      state: "unavailable",
      code: "claims_unavailable",
    });
    expect(unstable_rethrow).toHaveBeenCalledWith(failure);
  });

  it("maps a thrown claims transport failure to unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("claims transport failed");
    mockedCreateClient.mockResolvedValue(client({ claimsThrows: failure }));

    await expect(getViewer()).resolves.toEqual({
      state: "unavailable",
      code: "claims_unavailable",
    });
    expect(unstable_rethrow).toHaveBeenCalledWith(failure);
  });

  it("fails staff authorization closed when its transport throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("staff transport failed");
    mockedCreateClient.mockResolvedValue(
      client({ claims: { sub: "user-1", aal: "aal2" }, adminThrows: failure }),
    );

    await expect(getViewer()).resolves.toMatchObject({
      state: "authenticated",
      id: "user-1",
      isAdmin: false,
      staffRoleState: "unavailable",
    });
    expect(unstable_rethrow).toHaveBeenCalledWith(failure);
  });
});
