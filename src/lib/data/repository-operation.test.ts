import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import { unstable_rethrow } from "next/navigation";

describe("repository operation boundary", () => {
  beforeEach(() => vi.mocked(unstable_rethrow).mockReset());

  it("returns successful operation values without losing their type", async () => {
    await expect(
      attemptRepositoryOperation(async () => ({ count: 3 })),
    ).resolves.toEqual({ ok: true, value: { count: 3 } });
  });

  it("captures an ordinary operational failure", async () => {
    const failure = new Error("transport unavailable");

    await expect(
      attemptRepositoryOperation(async () => Promise.reject(failure)),
    ).resolves.toEqual({ ok: false, error: failure });
    expect(unstable_rethrow).toHaveBeenCalledWith(failure);
  });

  it("does not swallow a framework-controlled error", async () => {
    const frameworkError = new Error("next framework signal");
    vi.mocked(unstable_rethrow).mockImplementationOnce((error) => {
      throw error;
    });

    await expect(
      attemptRepositoryOperation(async () => Promise.reject(frameworkError)),
    ).rejects.toBe(frameworkError);
  });
});
