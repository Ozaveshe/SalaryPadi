import { describe, expect, it, vi } from "vitest";

import { createBoundedFetch } from "@/lib/supabase/bounded-fetch";

describe("createBoundedFetch", () => {
  it("attaches the configured deadline to requests without a signal", async () => {
    const deadline = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response());
    const timeoutSignal = vi.fn(() => deadline.signal);

    const boundedFetch = createBoundedFetch(6_000, fetchImpl, timeoutSignal);
    await boundedFetch("https://example.com/rest/v1/jobs");

    expect(timeoutSignal).toHaveBeenCalledWith(6_000);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.com/rest/v1/jobs",
      expect.objectContaining({ signal: deadline.signal }),
    );
  });

  it("preserves caller cancellation while adding the deadline", async () => {
    const caller = new AbortController();
    const deadline = new AbortController();
    let forwardedSignal: AbortSignal | null | undefined;
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      forwardedSignal = init?.signal;
      return new Response();
    });

    const boundedFetch = createBoundedFetch(
      4_000,
      fetchImpl,
      () => deadline.signal,
    );
    await boundedFetch("https://example.com/auth/v1/user", {
      signal: caller.signal,
    });

    expect(forwardedSignal).not.toBe(caller.signal);
    expect(forwardedSignal).not.toBe(deadline.signal);
    expect(forwardedSignal?.aborted).toBe(false);

    caller.abort();
    expect(forwardedSignal?.aborted).toBe(true);
  });

  it("preserves a Request object's cancellation signal", async () => {
    const caller = new AbortController();
    const deadline = new AbortController();
    let forwardedSignal: AbortSignal | null | undefined;
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      forwardedSignal = init?.signal;
      return new Response();
    });
    const request = new Request("https://example.com/rest/v1/jobs", {
      signal: caller.signal,
    });

    await createBoundedFetch(4_000, fetchImpl, () => deadline.signal)(request);
    caller.abort();

    expect(forwardedSignal?.aborted).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid timeout (%s)",
    (timeoutMs) => {
      expect(() => createBoundedFetch(timeoutMs)).toThrow(RangeError);
    },
  );
});
