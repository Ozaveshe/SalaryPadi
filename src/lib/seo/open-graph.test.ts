import { describe, expect, it } from "vitest";

import type { CompanySummary } from "@/lib/companies/repository";
import {
  repositoryDegraded,
  repositoryReady,
} from "@/lib/data/repository-result";
import type { EditorialArticle } from "@/lib/editorial/repository";
import { normalizeRemotiveJob } from "@/lib/jobs/normalize";
import type { PublicSalaryAggregate } from "@/lib/salaries/repository";

import {
  OPEN_GRAPH_IMAGE_CONTENT_TYPE,
  OPEN_GRAPH_IMAGE_SIZE,
  buildCompanyOpenGraphModel,
  buildInsightOpenGraphModel,
  buildJobOpenGraphModel,
  buildSalaryOpenGraphModel,
  buildSocialImageMetadata,
} from "./open-graph";

const job = normalizeRemotiveJob(
  {
    id: 101,
    url: "https://remotive.com/remote-jobs/software-dev/example-101",
    title: "Platform Engineer",
    company_name: "Padi Labs",
    company_logo: null,
    company_logo_url: null,
    category: "Software Development",
    tags: ["TypeScript"],
    job_type: "full_time",
    publication_date: "2026-07-12T12:00:00+00:00",
    candidate_required_location: "Nigeria, Ghana",
    salary: "USD 6000 - 8000 per month",
    description: "<p>REMOTIVE_DESCRIPTION_MUST_NOT_LEAK</p>",
  },
  "2026-07-13T00:00:00.000Z",
);

const company: CompanySummary = {
  databaseId: "6ed342a2-a4be-42e4-91af-1fb47b39f5fb",
  name: "Padi Labs",
  slug: "padi-labs",
  websiteUrl: "https://example.com",
  industry: "Technology",
  sizeBand: "11-50",
  description: null,
  headquartersCountry: "NG",
  legalEntities: [],
  aliases: [],
  officialDomains: [],
  citations: [],
  activeJobs: [job, { ...job, id: "expired", status: "expired" }],
  categories: ["Software Development"],
  remoteLocations: ["Nigeria"],
  verification: "employer_verified",
  lastCheckedAt: "2026-07-13T00:00:00.000Z",
};

const salaryAggregate: PublicSalaryAggregate = {
  id: "aggregate-1",
  companySlug: null,
  roleSlug: "platform-engineer",
  roleFamily: "Platform Engineer",
  countryCode: "NG",
  seniority: "all",
  arrangement: "all",
  currency: "NGN",
  grossNet: "gross",
  medianAnnual: 9_000_000,
  percentile25Annual: 7_000_000,
  percentile75Annual: 12_000_000,
  sampleSize: 7,
  submissionMonthStart: "2026-01-01",
  submissionMonthEnd: "2026-06-01",
  confidence: "medium",
  calculatedAt: "2026-07-12T00:00:00.000Z",
  evidenceLane: "first_party_contributions",
  sourceName: "SalaryPadi community",
  sourceUrl: null,
  methodologyUrl: null,
  sourceRoleLabel: null,
  sourcePayPeriod: null,
  sourceMedianAmount: null,
  provenanceLabel: "Privacy-thresholded approved contributions",
};

describe("dynamic Open Graph image models", () => {
  it("uses job facts without exposing a Remotive description", () => {
    const model = buildJobOpenGraphModel(job);

    expect(model.title).toBe("Platform Engineer");
    expect(model.subtitle).toBe("Padi Labs");
    expect(model.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Published salary" }),
        expect.objectContaining({ value: "Open to Nigeria" }),
      ]),
    );
    expect(JSON.stringify(model)).not.toContain(
      "REMOTIVE_DESCRIPTION_MUST_NOT_LEAK",
    );
  });

  it("publishes company ratings only at the configured snapshot threshold", () => {
    const rating = {
      company_slug: company.slug,
      sample_size: 4,
      overall_rating: 4.2,
      confidence_label: "medium" as const,
      computed_at: "2026-07-12T00:00:00.000Z",
    };

    expect(buildCompanyOpenGraphModel(company, rating, 5).facts).toEqual([
      expect.objectContaining({ label: "Active jobs", value: "1" }),
    ]);
    expect(buildCompanyOpenGraphModel(company, rating, 4).facts).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: "4.2 / 5" })]),
    );
    expect(
      buildCompanyOpenGraphModel(company, rating, null).facts,
    ).toHaveLength(1);
    expect(buildCompanyOpenGraphModel(company, rating, 4, false).facts).toEqual(
      [expect.objectContaining({ value: "4.2 / 5" })],
    );
  });

  it("uses only ready, published salary aggregates for numeric facts", () => {
    const ready = buildSalaryOpenGraphModel(
      "ng",
      "platform-engineer",
      repositoryReady([salaryAggregate]),
    );
    expect(ready.title).toBe("Platform Engineer");
    expect(ready.subtitle).toBe("Nigeria");
    expect(ready.facts[0]).toMatchObject({
      label: "Published annual range",
    });

    const degraded = buildSalaryOpenGraphModel(
      "ng",
      "platform-engineer",
      repositoryDegraded(
        [salaryAggregate],
        [
          {
            operation: "salaries.search",
            kind: "invalid_rows",
            code: "salaries_invalid_rows",
          },
        ],
      ),
    );
    expect(degraded.facts).toEqual([]);

    expect(
      buildSalaryOpenGraphModel(
        "ng",
        "platform-engineer",
        repositoryReady([
          {
            ...salaryAggregate,
            percentile25Annual: null,
            percentile75Annual: null,
          },
        ]),
      ).facts,
    ).toEqual([]);
  });

  it("uses the published brief date and explicit social image dimensions", () => {
    const article: EditorialArticle = {
      id: "fba037d6-9c02-4d03-87cf-4d3e5eeded17",
      slug: "salary-trends",
      title: "Salary trends in Nigerian engineering",
      description: "Published aggregate trends.",
      article_kind: "data_brief",
      body_markdown: "Body",
      author_name: "SalaryPadi Editorial",
      published_at: "2026-07-12T00:00:00.000Z",
      updated_at: "2026-07-12T00:00:00.000Z",
      internal_link_targets: [],
    };
    const model = buildInsightOpenGraphModel(article);
    const metadata = buildSocialImageMetadata(
      "/insights/salary-trends/opengraph-image",
      "Salary trends",
    );

    expect(model.facts[0]).toMatchObject({
      label: "Published",
      value: expect.stringContaining("2026"),
    });
    expect(metadata.openGraphImages[0]).toMatchObject({
      width: OPEN_GRAPH_IMAGE_SIZE.width,
      height: OPEN_GRAPH_IMAGE_SIZE.height,
      type: OPEN_GRAPH_IMAGE_CONTENT_TYPE,
    });
  });
});
