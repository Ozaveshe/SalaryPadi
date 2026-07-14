import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

import { attemptApiOperation } from "@/lib/api/operation";
import { unstable_rethrow } from "next/navigation";

describe("API operation boundary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(unstable_rethrow).mockReset();
  });

  it("returns successful operation values unchanged", async () => {
    await expect(
      attemptApiOperation("test.read", "test_failed", "Unavailable.", () =>
        Promise.resolve({ data: "ok" }),
      ),
    ).resolves.toEqual({ ok: true, value: { data: "ok" } });
  });

  it("maps ordinary transport failures to a logged no-store 503", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const failure = new Error("private transport detail");

    const result = await attemptApiOperation(
      "test.write",
      "test_write_failed",
      "The change was not saved.",
      () => Promise.reject(failure),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(503);
    expect(result.response.headers.get("cache-control")).toBe("no-store");
    await expect(result.response.json()).resolves.toEqual({
      error: "The change was not saved.",
    });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('"code":"test_write_failed"'),
    );
    expect(unstable_rethrow).toHaveBeenCalledWith(failure);
  });
});
