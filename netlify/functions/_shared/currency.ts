import { z } from "zod";

import { discardResponseBody } from "../../../src/lib/http/body";
import {
  boundedSignal,
  EXTERNAL_REQUEST_TIMEOUT_MS,
  OperationalError,
  readBoundedOperationalJson,
} from "./runtime";

const CURRENCY_MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_PUBLISHED_CROSS_RATE = 1_000_000_000_000;

const supportedCurrencies = [
  "EUR",
  "NGN",
  "GHS",
  "KES",
  "ZAR",
  "USD",
  "GBP",
] as const;

const inforEuroRow = z.object({
  isoA3Code: z.string().regex(/^[A-Z]{3}$/),
  value: z.coerce.number().positive(),
});

const inforEuroResponse = z.array(inforEuroRow).min(20).max(300);

export type CurrencyRateRow = {
  base_currency: string;
  quote_currency: string;
  rate: number;
};

export function buildInforEuroCrossRates(payload: unknown): CurrencyRateRow[] {
  const rows = inforEuroResponse.parse(payload);
  const unitsPerEuro = new Map<string, number>();
  for (const row of rows) {
    if (unitsPerEuro.has(row.isoA3Code)) {
      throw new OperationalError("currency_duplicate_currency");
    }
    unitsPerEuro.set(row.isoA3Code, row.value);
  }
  const missing = supportedCurrencies.filter(
    (currency) => !unitsPerEuro.has(currency),
  );
  if (missing.length > 0) {
    throw new OperationalError("currency_missing_required", {
      missing_count: missing.length,
    });
  }

  return supportedCurrencies.flatMap((base) =>
    supportedCurrencies.flatMap((quote) => {
      if (base === quote) return [];
      const basePerEuro = unitsPerEuro.get(base)!;
      const quotePerEuro = unitsPerEuro.get(quote)!;
      const rate = Number((quotePerEuro / basePerEuro).toFixed(10));
      if (
        !Number.isFinite(rate) ||
        rate <= 0 ||
        rate > MAX_PUBLISHED_CROSS_RATE
      ) {
        throw new OperationalError("currency_rate_out_of_range");
      }
      return [
        {
          base_currency: base,
          quote_currency: quote,
          rate,
        },
      ];
    }),
  );
}

export function currentInforEuroSource(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return {
    observedAt: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
    sourceUrl: `https://ec.europa.eu/budg/inforeuro/api/public/monthly-rates?year=${year}&month=${month}`,
  };
}

export async function fetchInforEuroRates(
  now = new Date(),
  signal?: AbortSignal,
) {
  const source = currentInforEuroSource(now);
  const response = await fetch(source.sourceUrl, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    signal: boundedSignal(signal, EXTERNAL_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    await discardResponseBody(response);
    throw new OperationalError(`currency_source_${response.status}`);
  }
  const payload = await readBoundedOperationalJson(
    response,
    CURRENCY_MAX_RESPONSE_BYTES,
    "currency_source_invalid_response",
  );
  let rates: CurrencyRateRow[];
  try {
    rates = buildInforEuroCrossRates(payload);
  } catch (reason) {
    if (reason instanceof OperationalError) throw reason;
    throw new OperationalError("currency_source_invalid_response");
  }
  return { ...source, rates };
}
