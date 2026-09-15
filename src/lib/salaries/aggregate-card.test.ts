import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SalaryAggregateCard } from "@/components/salaries/salary-aggregate-card";
import type { PublicSalaryAggregate } from "./aggregate-row";

// Rendering-only fixture: never written to a database or public dataset.
const benchmark: PublicSalaryAggregate = {
  id: "synthetic-benchmark",
  companySlug: null,
  roleSlug: "sales",
  roleFamily: "Sales",
  countryCode: "NG",
  seniority: "all",
  arrangement: "unspecified",
  currency: "NGN",
  grossNet: "mixed",
  medianAnnual: 2_400_000,
  percentile25Annual: 1_200_000,
  percentile75Annual: 3_600_000,
  sampleSize: 80,
  submissionMonthStart: "2025-08-01",
  submissionMonthEnd: "2026-07-01",
  confidence: "medium",
  calculatedAt: "2026-07-30T00:00:00.000Z",
  evidenceLane: "verified_online_benchmark",
  sourceName: "Licensed job-posting dataset",
  sourceUrl: "https://example.test/jobs-data",
  methodologyUrl: "https://example.test/methodology",
  sourceRoleLabel: "Sales job postings with disclosed monthly pay",
  sourcePayPeriod: "monthly",
  sourceMedianAmount: 200_000,
  provenanceLabel: "Reviewed licensed job-posting data",
};

describe("salary card evidence claims", () => {
  it("does not turn a licensed benchmark into official or community pay evidence", () => {
    const html = renderToStaticMarkup(
      createElement(SalaryAggregateCard, { aggregate: benchmark }),
    );

    expect(html).toContain("Reviewed source benchmark");
    expect(html).toContain(benchmark.sourceName);
    expect(html).toContain(benchmark.provenanceLabel);
    expect(html).toContain("80 source-reported observations");
    expect(html).not.toContain("Reviewed official statistics");
    expect(html).not.toContain("Contributions from people doing this job");
    expect(html).not.toContain("Most people earn between");
    expect(html).toContain("25th–75th percentile range:");
  });

  it("preserves official provenance when the source supplies it", () => {
    const html = renderToStaticMarkup(
      createElement(SalaryAggregateCard, {
        aggregate: {
          ...benchmark,
          sourceName: "Official statistics publisher",
          provenanceLabel: "Reviewed official statistics",
          sampleSize: null,
        },
      }),
    );

    expect(html).toContain("Official statistics publisher");
    expect(html).toContain("Reviewed official statistics");
    expect(html).toContain("Not published by the source");
  });

  it("continues to identify privacy-approved community evidence separately", () => {
    const html = renderToStaticMarkup(
      createElement(SalaryAggregateCard, {
        aggregate: {
          ...benchmark,
          evidenceLane: "first_party_contributions",
          sourceName: "SalaryPadi community",
          sourceUrl: null,
          methodologyUrl: null,
          sourceRoleLabel: null,
          sourcePayPeriod: null,
          sourceMedianAmount: null,
          provenanceLabel: "Privacy-thresholded approved contributions",
        },
      }),
    );

    expect(html).toContain("Community evidence");
    expect(html).toContain("Contributions from people doing this job");
    expect(html).toContain("80 approved distinct contributors");
    expect(html).not.toContain("Reviewed source benchmark");
  });
});
