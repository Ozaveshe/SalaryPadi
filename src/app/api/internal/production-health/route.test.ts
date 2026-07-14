import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/api", () => ({ getAdminApiContext: vi.fn() }));
vi.mock("@/lib/operations/production-health", () => ({
  getProductionHealth: vi.fn(),
}));

import { GET } from "@/app/api/internal/production-health/route";
import { getAdminApiContext } from "@/lib/auth/api";
import { getProductionHealth } from "@/lib/operations/production-health";

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
    expect(getProductionHealth).not.toHaveBeenCalled();
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
    vi.mocked(getProductionHealth).mockResolvedValue(health);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(health);
    expect(getProductionHealth).toHaveBeenCalledWith(supabase);
  });

  it("fails closed when operational evidence cannot be loaded", async () => {
    vi.mocked(getAdminApiContext).mockResolvedValue({
      ok: true,
      supabase: {},
    } as never);
    vi.mocked(getProductionHealth).mockRejectedValue(new Error("unavailable"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
