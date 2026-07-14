import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/api", () => ({ getAdminApiContext: vi.fn() }));
vi.mock("@/lib/operations/production-health", () => ({
  getProductionHealthResult: vi.fn(),
}));

import { GET } from "@/app/api/internal/production-health/route";
import { getAdminApiContext } from "@/lib/auth/api";
import { getProductionHealthResult } from "@/lib/operations/production-health";

const health = {
  generated_at: "2026-07-13T19:00:00.000Z",
  window_start: "2026-06-29T19:00:00.000Z",
  workers: [],
  sources: [],
  open_alerts: [],
};

describe("internal production health", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects a request without an AAL2 administrator context", async () => {
    vi.mocked(getAdminApiContext).mockResolvedValue({
      ok: false,
      response: Response.json(
        { error: "Authentication required." },
        { status: 401 },
      ),
    });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(getProductionHealthResult).not.toHaveBeenCalled();
  });

  it("returns only the validated, no-store operational DTO", async () => {
    const supabase = { schema: vi.fn() };
    vi.mocked(getAdminApiContext).mockResolvedValue({
      ok: true,
      viewer: {
        state: "authenticated",
        id: "00000000-0000-4000-8000-000000000001",
        email: null,
        isAdmin: true,
        staffRoleState: "ready",
        aal: "aal2",
      },
      supabase,
    } as never);
    vi.mocked(getProductionHealthResult).mockResolvedValue({
      state: "ready",
      data: health,
      issues: [],
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(health);
    expect(getProductionHealthResult).toHaveBeenCalledWith(supabase);
  });

  it("fails closed when operational evidence cannot be loaded", async () => {
    vi.mocked(getAdminApiContext).mockResolvedValue({
      ok: true,
      supabase: {},
    } as never);
    vi.mocked(getProductionHealthResult).mockResolvedValue({
      state: "invalid",
      data: null,
      issues: [
        {
          operation: "operations.production_health",
          kind: "invalid_container",
          code: "production_health_invalid",
        },
      ],
    });

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      state: "invalid",
      code: "production_health_invalid",
    });
  });
});
