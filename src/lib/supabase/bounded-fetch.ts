type TimeoutSignalFactory = (timeoutMs: number) => AbortSignal;

export function createBoundedFetch(
  timeoutMs: number,
  fetchImpl: typeof fetch = globalThis.fetch,
  timeoutSignal: TimeoutSignalFactory = AbortSignal.timeout,
): typeof fetch {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("Supabase fetch timeout must be a positive integer.");
  }

  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const requestSignal =
      init?.signal ?? (input instanceof Request ? input.signal : null);
    const deadline = timeoutSignal(timeoutMs);
    const signal = requestSignal
      ? AbortSignal.any([requestSignal, deadline])
      : deadline;

    return fetchImpl(input, { ...init, signal });
  }) as typeof fetch;
}
