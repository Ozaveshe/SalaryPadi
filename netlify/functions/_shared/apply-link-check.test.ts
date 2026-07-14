import { describe, expect, it, vi } from "vitest";

import { checkApplyLink } from "./apply-link-check";

const signal = new AbortController().signal;
const publicResolve = async () => ["8.8.8.8"];

describe("apply link checker", () => {
  it("rejects private destinations before a request", async () => {
    const fetcher = vi.fn();
    await expect(
      checkApplyLink("https://127.0.0.1/jobs/1", signal, {
        fetch: fetcher,
      }),
    ).resolves.toMatchObject({
      result: "indeterminate",
      errorCode: "unsafe_apply_destination",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    "100.64.0.1",
    "192.0.2.1",
    "198.51.100.2",
    "203.0.113.3",
    "2001:db8::1",
  ])("rejects reserved destination %s", async (address) => {
    const fetcher = vi.fn();
    await expect(
      checkApplyLink("https://jobs.example.test/1", signal, {
        fetch: fetcher,
        resolve: async () => [address],
      }),
    ).resolves.toMatchObject({ errorCode: "unsafe_apply_destination" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [204, "healthy", null],
    [404, "broken", "apply_link_http_404"],
    [410, "broken", "apply_link_http_410"],
    [403, "indeterminate", "apply_link_http_403"],
    [429, "indeterminate", "apply_link_http_429"],
  ] as const)(
    "classifies HTTP %s conservatively",
    async (status, result, code) => {
      await expect(
        checkApplyLink("https://jobs.example.test/1", signal, {
          fetch: vi.fn().mockResolvedValue(new Response(null, { status })),
          resolve: publicResolve,
          now: () => 100,
        }),
      ).resolves.toMatchObject({ result, httpStatus: status, errorCode: code });
    },
  );

  it("retries transient failures with bounded jitter", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      checkApplyLink("https://jobs.example.test/1", signal, {
        fetch: fetcher,
        resolve: publicResolve,
        sleep,
        random: () => 0.5,
      }),
    ).resolves.toMatchObject({ result: "healthy", httpStatus: 204 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(50);
  });
});
