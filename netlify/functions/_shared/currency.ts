import { z } from "zod";

import { OperationalError } from "./runtime";

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
    if (!unitsPerEuro.has(row.isoA3Code)) {
      unitsPerEuro.set(row.isoA3Code, row.value);
    }
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
      return [
        {
          base_currency: base,
          quote_currency: quote,
          rate: Number((quotePerEuro / basePerEuro).toFixed(10)),
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

export async function fetchInforEuroRates(now = new Date()) {
  const source = currentInforEuroSource(now);
  const response = await fetch(source.sourceUrl, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new OperationalError(`currency_source_${response.status}`);
  }
  const rates = buildInforEuroCrossRates(await response.json());
  return { ...source, rates };
}
