import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { getReferenceCurrencyRatesResult } from "@/lib/currency/repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const mockedCreateClient = vi.mocked(createServerSupabaseClient);

function clientReturning(data: unknown, error: unknown = null) {
  const result = Promise.resolve({ data, error });
  const query = {
    select: () => query,
    order: () => query,
    then: result.then.bind(result),
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
  data_period: "2026-07-11",
};

describe("currency repository", () => {
  beforeEach(() => vi.restoreAllMocks());

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

  it("surfaces provider query errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning(null, { message: "query failed" }),
    );
    expect((await getReferenceCurrencyRatesResult()).state).toBe("unavailable");
  });
});
