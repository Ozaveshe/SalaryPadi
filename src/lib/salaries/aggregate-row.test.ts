import { describe, expect, it } from "vitest";

import { decodePublicSalaryAggregate } from "./aggregate-row";

const firstPartyRow = {
  id: "e6aa35b4-5694-4c56-ac86-3df86d466296",
  company_slug: "acme",
  role_slug: "product-manager",
  role_family: "Product Manager",
  country_code: "NG",
  seniority: "mid",
  arrangement: "employee",
  currency: "NGN",
  gross_net: "gross",
  median_annual: 12_000_000,
  percentile_25_annual: 10_000_000,
  percentile_75_annual: 14_000_000,
  sample_size: 5,
  submission_month_start: "2026-01-01",
  submission_month_end: "2026-06-01",
  confidence: "medium",
  calculated_at: "2026-07-11T00:00:00.000Z",
  evidence_lane: "first_party_contributions",
  source_name: "SalaryPadi community",
  source_url: null,
  methodology_url: null,
  source_role_label: null,
  source_pay_period: null,
  source_median_amount: null,
  provenance_label: "Privacy-thresholded approved contributions",
};

describe("salary aggregate row decoder", () => {
  it("maps a complete first-party aggregate without fallback values", () => {
    const result = decodePublicSalaryAggregate(firstPartyRow);

    expect(result).toMatchObject({
      ok: true,
      aggregate: {
        id: firstPartyRow.id,
        grossNet: "gross",
        confidence: "medium",
        calculatedAt: "2026-07-11T00:00:00.000Z",
        evidenceLane: "first_party_contributions",
      },
    });
  });

  it("maps the database unspecified classification to an explicit mixed state", () => {
    const result = decodePublicSalaryAggregate({
      ...firstPartyRow,
      gross_net: "unspecified",
    });

    expect(result.ok && result.aggregate.grossNet).toBe("mixed");
  });

  it.each([
    ["confidence", { confidence: "unknown" }],
    ["calculated_at", { calculated_at: "not-a-date" }],
    ["evidence_lane", { evidence_lane: "mystery" }],
    ["percentile_25_annual", { percentile_25_annual: 13_000_000 }],
    ["percentile_75_annual", { percentile_75_annual: 11_000_000 }],
    ["submission_month_end", { submission_month_end: "2025-12-01" }],
  ])("rejects an invalid %s instead of inventing a default", (path, patch) => {
    const result = decodePublicSalaryAggregate({ ...firstPartyRow, ...patch });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.issuePaths).toContain(path);
  });

  it("fails closed when first-party evidence is below the privacy threshold", () => {
    const result = decodePublicSalaryAggregate({
      ...firstPartyRow,
      sample_size: 2,
    });

    expect(result).toMatchObject({ ok: false, issuePaths: ["sample_size"] });
  });

  it("requires complete HTTPS provenance for an online benchmark", () => {
    const incomplete = decodePublicSalaryAggregate({
      ...firstPartyRow,
      evidence_lane: "verified_online_benchmark",
      company_slug: null,
      sample_size: null,
      source_name: "Official statistics publisher",
      source_url: "http://example.test/wages",
      source_role_label: null,
      source_pay_period: null,
      source_median_amount: null,
      provenance_label: "Reviewed official statistics",
    });

    expect(incomplete.ok).toBe(false);
    expect(!incomplete.ok && incomplete.issuePaths).toEqual(
      expect.arrayContaining([
        "source_url",
        "source_role_label",
        "source_pay_period",
        "source_median_amount",
      ]),
    );

    const complete = decodePublicSalaryAggregate({
      ...firstPartyRow,
      id: "753aaf0d-7958-4458-8dff-f94e05ff7c77",
      evidence_lane: "verified_online_benchmark",
      company_slug: null,
      sample_size: null,
      source_name: "Official statistics publisher",
      source_url: "https://example.gov/wages",
      methodology_url: "https://example.gov/wages/methodology",
      source_role_label: "Software developers",
      source_pay_period: "annual",
      source_median_amount: 120_000,
      provenance_label: "Reviewed official statistics",
    });
    expect(complete.ok).toBe(true);
  });
});
