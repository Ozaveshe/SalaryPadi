import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/dal", () => ({ getViewer: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { getAdminApiContext, getAuthenticatedApiContext } from "@/lib/auth/api";
import { getViewer } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const mockedViewer = vi.mocked(getViewer);
const mockedCreateClient = vi.mocked(createServerSupabaseClient);

describe("authenticated API context", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns 503 when claims cannot be verified", async () => {
    mockedViewer.mockResolvedValue({
      state: "unavailable",
      code: "claims_unavailable",
    });
    const result = await getAuthenticatedApiContext();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });

  it("returns 401 only for a verified anonymous session", async () => {
    mockedViewer.mockResolvedValue({ state: "anonymous" });
    const result = await getAuthenticatedApiContext();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
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
    if (!result.ok) expect(result.response.status).toBe(503);
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
    if (!nonAdmin.ok) expect(nonAdmin.response.status).toBe(403);

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
    if (!aal1.ok) expect(aal1.response.status).toBe(403);
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
