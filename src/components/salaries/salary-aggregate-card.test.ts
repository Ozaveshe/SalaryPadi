import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PublicSalaryAggregate } from "@/lib/salaries/repository";
import { SalaryAggregateCard } from "./salary-aggregate-card";

const benchmark: PublicSalaryAggregate = {
  id: "render-only-benchmark",
  companySlug: null,
  roleSlug: "test-role",
  roleFamily: "Render test role",
  countryCode: "US",
  seniority: "all",
  arrangement: "all",
  currency: "USD",
  grossNet: "gross",
  medianAnnual: 50_000,
  percentile25Annual: 20_000,
  percentile75Annual: 80_000,
  sampleSize: null,
  submissionMonthStart: "2025-01-01",
  submissionMonthEnd: "2025-12-31",
  confidence: "medium",
  calculatedAt: "2026-10-01T00:00:00Z",
  evidenceLane: "verified_online_benchmark",
  sourceName: "Render-only source fixture",
  sourceUrl: "https://example.gov/salary-test",
  methodologyUrl: null,
  sourceRoleLabel: "Test occupation",
  sourcePayPeriod: "annual",
  sourceMedianAmount: 50_000,
  provenanceLabel: "Synthetic benchmark for component rendering only",
};

describe("salary range rendering under the production CSP", () => {
  it("renders the range and median without blocked inline styling", () => {
    const markup = renderToStaticMarkup(
      createElement(SalaryAggregateCard, { aggregate: benchmark }),
    );
    expect(markup).not.toContain('style="');
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="25th percentile');
    expect(markup).toContain("median");

    const start = Number(markup.match(/<rect[^>]*x="([\d.]+)%"/)?.[1]);
    const width = Number(markup.match(/<rect[^>]*width="([\d.]+)%"/)?.[1]);
    const median = Number(markup.match(/<line[^>]*x1="([\d.]+)%"/)?.[1]);
    expect(start).toBeGreaterThan(0);
    expect(start + width).toBeLessThan(100);
    expect(median).toBeGreaterThan(start);
    expect(median).toBeLessThan(start + width);
    expect(markup).toContain('vector-effect="non-scaling-stroke"');
  });

  it("withholds the chart when its percentile order is invalid", () => {
    const markup = renderToStaticMarkup(
      createElement(SalaryAggregateCard, {
        aggregate: { ...benchmark, percentile25Annual: 60_000 },
      }),
    );
    expect(markup).not.toContain('class="salary-range-track"');
    expect(markup).not.toContain('role="img"');
  });
});
