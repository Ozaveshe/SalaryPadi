import "server-only";

import { searchSalaryAggregatesResult } from "@/lib/salaries/repository";

/**
 * Verified benchmarks from non-market countries are reference points for
 * evaluating remote offers. One list feeds every surface that renders a
 * "Remote benchmark reference" section; adding a country here adds it
 * everywhere at once.
 */
export const BENCHMARK_REFERENCE_COUNTRIES = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
] as const;

export type BenchmarkReferenceCountry =
  (typeof BENCHMARK_REFERENCE_COUNTRIES)[number];

/**
 * The benchmark aggregates per reference country, optionally narrowed to a
 * role family; countries with no rows are omitted so callers render only
 * sections with content.
 */
export async function getBenchmarkReferences({ role }: { role?: string } = {}) {
  const references = await Promise.all(
    BENCHMARK_REFERENCE_COUNTRIES.map(async (country) => ({
      ...country,
      result: await searchSalaryAggregatesResult({
        country: country.code,
        ...(role ? { role } : {}),
      }),
    })),
  );
  return references.filter((reference) => reference.result.data.length > 0);
}
