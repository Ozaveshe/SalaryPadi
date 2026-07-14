import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildInforEuroCrossRates,
  currentInforEuroSource,
  fetchInforEuroRates,
} from "./currency";

const required = [
  ["EUR", 1],
  ["NGN", 1562.4],
  ["GHS", 12.8355],
  ["KES", 147.365],
  ["ZAR", 18.7233],
  ["USD", 1.1406],
  ["GBP", 0.86215],
] as const;

const extras = Array.from({ length: 13 }, (_, index) => ({
  isoA3Code: `AA${String.fromCharCode(65 + index)}`,
  value: index + 2,
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("European Commission InforEuro adapter", () => {
  it("builds every non-identity cross-rate for the supported launch currencies", () => {
    const rates = buildInforEuroCrossRates([
      ...required.map(([isoA3Code, value]) => ({ isoA3Code, value })),
      ...extras,
    ]);
    expect(rates).toHaveLength(42);
    expect(
      rates.find(
        (rate) => rate.base_currency === "USD" && rate.quote_currency === "NGN",
      )?.rate,
    ).toBeCloseTo(1562.4 / 1.1406, 8);
  });

  it("pins the request and provenance period to the UTC calendar month", () => {
    expect(currentInforEuroSource(new Date("2026-07-31T23:59:00Z"))).toEqual({
      observedAt: "2026-07-01T00:00:00.000Z",
      sourceUrl:
        "https://ec.europa.eu/budg/inforeuro/api/public/monthly-rates?year=2026&month=7",
    });
  });

  it("fails closed when a required African currency is absent", () => {
    const payload = [
      ...required
        .filter(([code]) => code !== "NGN")
        .map(([isoA3Code, value]) => ({ isoA3Code, value })),
      ...extras,
      { isoA3Code: "AAZ", value: 30 },
    ];
    expect(() => buildInforEuroCrossRates(payload)).toThrow(
      /currency_missing_required/,
    );
  });

  it("rejects duplicate currency evidence instead of choosing one value", () => {
    expect(() =>
      buildInforEuroCrossRates([
        ...required.map(([isoA3Code, value]) => ({ isoA3Code, value })),
        ...extras,
        { isoA3Code: "NGN", value: 1_700 },
      ]),
    ).toThrow(/currency_duplicate_currency/);
  });

  it("rejects a derived rate outside the public currency contract", () => {
    expect(() =>
      buildInforEuroCrossRates([
        ...required.map(([isoA3Code, value]) => ({
          isoA3Code,
          value: isoA3Code === "NGN" ? 2_000_000_000_000 : value,
        })),
        ...extras,
      ]),
    ).toThrow(/currency_rate_out_of_range/);
  });

  it("maps malformed provider JSON to a stable operational error", async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{not-json", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(fetchInforEuroRates()).rejects.toMatchObject({
      code: "currency_source_invalid_response",
    });
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
  });
});
