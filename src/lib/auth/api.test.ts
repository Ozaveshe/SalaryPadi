import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ getViewer: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { getAdminApiContext, getAuthenticatedApiContext } from "@/lib/auth/api";
import { getViewer } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { unstable_rethrow } from "next/navigation";

const mockedViewer = vi.mocked(getViewer);
const mockedCreateClient = vi.mocked(createServerSupabaseClient);

describe("authenticated API context", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(unstable_rethrow).mockReset();
  });

  it("returns 503 when claims cannot be verified", async () => {
    mockedViewer.mockResolvedValue({
      state: "unavailable",
      code: "claims_unavailable",
    });
    const result = await getAuthenticatedApiContext();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(503);
      expect(result.response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("returns 503 when the authentication backend is unconfigured", async () => {
    mockedViewer.mockResolvedValue({ state: "unconfigured" });
    const result = await getAuthenticatedApiContext();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(503);
      expect(result.response.headers.get("cache-control")).toBe("no-store");
      await expect(result.response.json()).resolves.toEqual({
        error: "Authentication backend is not configured.",
      });
    }
  });

  it("returns 401 only for a verified anonymous session", async () => {
    mockedViewer.mockResolvedValue({ state: "anonymous" });
    const result = await getAuthenticatedApiContext();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(result.response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("returns 503 when staff authorization cannot be verified", async () => {
    mockedViewer.mockResolvedValue({
      state: "authenticated",
      id: "user-1",
      email: null,
      isAdmin: false,
      staffRoleState: "unavailable",
      aal: "aal2",
    });
    mockedCreateClient.mockResolvedValue({} as never);
    const result = await getAdminApiContext();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(503);
      expect(result.response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("returns 503 when the authenticated backend client is unavailable", async () => {
    mockedViewer.mockResolvedValue({
      state: "authenticated",
      id: "user-1",
      email: null,
      isAdmin: false,
      staffRoleState: "ready",
      aal: "aal1",
    });
    mockedCreateClient.mockResolvedValue(null);
    const result = await getAuthenticatedApiContext();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });

  it("returns an authenticated context when identity and backend are ready", async () => {
    const viewer = {
      state: "authenticated" as const,
      id: "user-1",
      email: null,
      isAdmin: false,
      staffRoleState: "ready" as const,
      aal: "aal1" as const,
    };
    const client = {} as never;
    mockedViewer.mockResolvedValue(viewer);
    mockedCreateClient.mockResolvedValue(client);
    await expect(getAuthenticatedApiContext()).resolves.toEqual({
      ok: true,
      viewer,
      supabase: client,
    });
  });

  it("returns 503 when authenticated client creation throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("authenticated backend failed");
    mockedViewer.mockResolvedValue({
      state: "authenticated",
      id: "user-1",
      email: null,
      isAdmin: false,
      staffRoleState: "ready",
      aal: "aal1",
    });
    mockedCreateClient.mockRejectedValue(failure);

    const result = await getAuthenticatedApiContext();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
    expect(unstable_rethrow).toHaveBeenCalledWith(failure);
  });

  it("enforces admin role and AAL2 independently", async () => {
    mockedCreateClient.mockResolvedValue({} as never);
    mockedViewer.mockResolvedValue({
      state: "authenticated",
      id: "user-1",
      email: null,
      isAdmin: false,
      staffRoleState: "ready",
      aal: "aal2",
    });
    const nonAdmin = await getAdminApiContext();
    expect(nonAdmin.ok).toBe(false);
    if (!nonAdmin.ok) {
      expect(nonAdmin.response.status).toBe(403);
      expect(nonAdmin.response.headers.get("cache-control")).toBe("no-store");
    }

    mockedViewer.mockResolvedValue({
      state: "authenticated",
      id: "admin-1",
      email: null,
      isAdmin: true,
      staffRoleState: "ready",
      aal: "aal1",
    });
    const aal1 = await getAdminApiContext();
    expect(aal1.ok).toBe(false);
    if (!aal1.ok) {
      expect(aal1.response.status).toBe(403);
      expect(aal1.response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("returns a verified administrator context", async () => {
    mockedCreateClient.mockResolvedValue({} as never);
    mockedViewer.mockResolvedValue({
      state: "authenticated",
      id: "admin-1",
      email: "admin@example.com",
      isAdmin: true,
      staffRoleState: "ready",
      aal: "aal2",
    });
    expect((await getAdminApiContext()).ok).toBe(true);
  });
});
