import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { getReferenceCurrencyRatesResult } from "@/lib/currency/repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { unstable_rethrow } from "next/navigation";

const mockedCreateClient = vi.mocked(createServerSupabaseClient);

function clientReturning(data: unknown, error: unknown = null) {
  const result = Promise.resolve({ data, error });
  const query = {
    select: () => query,
    order: () => query,
    limit: () => query,
    then: result.then.bind(result),
  };
  return { schema: () => ({ from: () => query }) } as never;
}

function clientThrowing(failure: Error) {
  const rejected = Promise.reject(failure);
  const query = {
    select: () => query,
    order: () => query,
    limit: () => query,
    then: rejected.then.bind(rejected),
  };
  return { schema: () => ({ from: () => query }) } as never;
}

const validRate = {
  base_currency: "EUR",
  quote_currency: "NGN",
  rate: 1800,
  provider_name: "European Commission",
  source_url: "https://example.com/rates",
  license_url: null,
  attribution_text: null,
  observed_at: "2026-07-11T00:00:00.000Z",
  fetched_at: "2026-07-11T01:00:00.000Z",
  data_period: "2026-07-01",
};

describe("currency repository", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(unstable_rethrow).mockReset();
  });

  it("returns validated rates", async () => {
    mockedCreateClient.mockResolvedValue(clientReturning([validRate]));
    const result = await getReferenceCurrencyRatesResult();
    expect(result.state).toBe("ready");
    expect(result.data).toEqual([validRate]);
  });

  it("does not drop malformed rates into a false empty result", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning([{ ...validRate, rate: -1 }]),
    );
    const result = await getReferenceCurrencyRatesResult();
    expect(result.state).toBe("invalid");
    expect(result.issues[0]?.code).toBe("currency_invalid_rows");
  });

  it.each([
    { observed_at: "not-a-timestamp" },
    { fetched_at: "2026-07-10T23:59:59.000Z" },
    { data_period: "2026-07-11" },
    { data_period: "2026-06-01" },
  ])("rejects inconsistent provenance evidence %#", async (override) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning([{ ...validRate, ...override }]),
    );

    await expect(getReferenceCurrencyRatesResult()).resolves.toMatchObject({
      state: "invalid",
      data: [],
      issues: [{ code: "currency_invalid_rows" }],
    });
  });

  it("rejects non-HTTPS rate provenance", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning([{ ...validRate, source_url: "javascript:alert(1)" }]),
    );

    await expect(getReferenceCurrencyRatesResult()).resolves.toMatchObject({
      state: "invalid",
      data: [],
      issues: [{ code: "currency_invalid_rows" }],
    });
  });

  it("rejects self-rates and duplicate currency pairs", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning([
        {
          ...validRate,
          base_currency: "EUR",
          quote_currency: "EUR",
          rate: 1,
        },
      ]),
    );
    await expect(getReferenceCurrencyRatesResult()).resolves.toMatchObject({
      state: "invalid",
      issues: [{ code: "currency_invalid_rows" }],
    });

    mockedCreateClient.mockResolvedValue(
      clientReturning([validRate, validRate]),
    );
    await expect(getReferenceCurrencyRatesResult()).resolves.toMatchObject({
      state: "invalid",
      data: [],
      issues: [{ code: "currency_invalid_rows" }],
    });
  });

  it("rejects a rate set larger than the reviewed provider bound", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning(Array.from({ length: 301 }, () => validRate)),
    );

    await expect(getReferenceCurrencyRatesResult()).resolves.toMatchObject({
      state: "invalid",
      data: [],
      issues: [{ code: "currency_invalid_rows" }],
    });
  });

  it("surfaces provider query errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning(null, { message: "query failed" }),
    );
    expect((await getReferenceCurrencyRatesResult()).state).toBe("unavailable");
  });

  it("maps a thrown client bootstrap failure to unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("client bootstrap failed");
    mockedCreateClient.mockRejectedValue(failure);

    await expect(getReferenceCurrencyRatesResult()).resolves.toMatchObject({
      state: "unavailable",
      data: [],
      issues: [{ code: "currency_query_failed" }],
    });
    expect(unstable_rethrow).toHaveBeenCalledWith(failure);
  });

  it("maps a thrown rate query transport failure to unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("rate transport failed");
    mockedCreateClient.mockResolvedValue(clientThrowing(failure));

    await expect(getReferenceCurrencyRatesResult()).resolves.toMatchObject({
      state: "unavailable",
      data: [],
      issues: [{ code: "currency_query_failed" }],
    });
    expect(unstable_rethrow).toHaveBeenCalledWith(failure);
  });
});
