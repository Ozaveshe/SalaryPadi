import { describe, expect, it } from "vitest";

import type { CompanySummary } from "@/lib/companies/repository";
import type { Job } from "@/lib/jobs/types";
import type { PublicSalaryAggregate } from "@/lib/salaries/repository";

import { buildSitemapEntries, renderSitemapXml } from "./sitemap";

function job({
  slug,
  companySlug,
  canIndex,
  postedAt,
}: {
  slug: string;
  companySlug: string;
  canIndex: boolean;
  postedAt: string;
}): Job {
  return {
    id: slug,
    databaseId: canIndex ? slug : null,
    slug,
    externalId: slug,
    source: {
      id: canIndex ? "employer-source" : "remotive-public-api",
      name: canIndex ? "Employer" : "Remotive",
      type: canIndex ? "employer" : "permitted_api",
      termsUrl: "https://example.com/terms",
      termsReviewedAt: "2026-07-10",
      attributionRequired: "Attribution required",
      canStoreFullDescription: canIndex,
      canIndex,
      canUseJobPostingStructuredData: canIndex,
      canEmail: false,
      destinationRequirement: "Use the source URL",
      refreshIntervalSeconds: 43_200,
    },
    sourceUrl: "https://example.com/job",
    applicationUrl: "https://example.com/apply",
    title: "Platform Engineer",
    company: {
      name: companySlug,
      slug: companySlug,
      verification: canIndex ? "employer_verified" : "source_listed",
    },
    locationDisplay: "Nigeria",
    workMode: "remote",
    employmentType: "full_time",
    arrangement: "employee",
    experienceLevel: "mid",
    category: "Engineering",
    skills: [],
    salary: null,
    eligibility: {
      scope: "nigeria",
      nigeria: "eligible",
      africa: "eligible",
      includedCountries: ["Nigeria"],
      excludedCountries: [],
      requiredTimezone: null,
      workAuthorization: null,
      visaSponsorship: "unclear",
      relocationSupport: "unclear",
      evidenceText: "Nigeria listed",
      provenance: "source_provided",
      lastVerifiedAt: postedAt,
    },
    description: "Build reliable systems.",
    requirements: null,
    benefits: null,
    postedAt,
    lastCheckedAt: "2026-07-13T00:00:00.000Z",
    validThrough: null,
    status: "open",
    riskIndicators: [],
    fingerprint: slug,
  };
}

function company(
  slug: string,
  activeJobs: Job[],
  databaseId: string | null = null,
): CompanySummary {
  return {
    databaseId,
    name: slug,
    slug,
    websiteUrl: null,
    industry: null,
    sizeBand: null,
    description: null,
    headquartersCountry: null,
    legalEntities: [],
    aliases: [],
    officialDomains: [],
    citations: [],
    activeJobs,
    categories: [],
    remoteLocations: [],
    verification: databaseId ? "employer_verified" : "source_listed",
    lastCheckedAt: "2026-07-10T00:00:00.000Z",
  };
}

function aggregate(
  calculatedAt: string,
  countryCode = "NG",
): PublicSalaryAggregate {
  return {
    id: calculatedAt,
    companySlug: null,
    roleSlug: "product-manager",
    roleFamily: "Product Manager",
    countryCode,
    seniority: "all",
    arrangement: "all",
    currency: countryCode === "GH" ? "GHS" : "NGN",
    grossNet: "gross",
    medianAnnual: 12_000_000,
    percentile25Annual: 10_000_000,
    percentile75Annual: 14_000_000,
    sampleSize: 5,
    submissionMonthStart: "2026-01-01",
    submissionMonthEnd: "2026-06-01",
    confidence: "medium",
    calculatedAt,
    evidenceLane: "first_party_contributions",
    sourceName: "SalaryPadi community",
    sourceUrl: null,
    methodologyUrl: null,
    sourceRoleLabel: null,
    sourcePayPeriod: null,
    sourceMedianAmount: null,
    provenanceLabel: "Privacy-thresholded approved contributions",
  };
}

describe("dynamic sitemap generation", () => {
  it("discovers only policy-permitted jobs and evidence-backed salary/company pages", () => {
    const employerJob = job({
      slug: "platform-engineer-padi",
      companySlug: "padi-labs",
      canIndex: true,
      postedAt: "2026-07-12T09:00:00.000Z",
    });
    const remotiveJob = job({
      slug: "remote-engineer-remotive",
      companySlug: "remote-only",
      canIndex: false,
      postedAt: "2026-07-13T09:00:00.000Z",
    });
    const result = buildSitemapEntries({
      origin: "https://salarypadi.com",
      editorial: [
        {
          id: "57cb1fcb-e724-4ab7-8df2-a8c95f0dc03e",
          slug: "remote-jobs-open-to-nigerians",
          title: "Remote jobs open to Nigerians",
          description: "Guide",
          article_kind: "cornerstone",
          body_markdown: "",
          author_name: "SalaryPadi Editorial",
          published_at: "2026-07-11T00:00:00.000Z",
          updated_at: "2026-07-11T00:00:00.000Z",
          internal_link_targets: [],
        },
        {
          id: "b21bb2e3-66c7-4044-87ba-c729d8147902",
          slug: "source-freshness",
          title: "Source freshness",
          description: "Brief",
          article_kind: "data_brief",
          body_markdown: "Brief",
          author_name: "SalaryPadi Editorial",
          published_at: "2026-07-11T08:00:00.000Z",
          updated_at: "2026-07-11T08:15:00.000Z",
          internal_link_targets: [],
        },
      ],
      jobFeed: {
        jobs: [employerJob, remotiveJob],
        state: "live",
        checkedAt: "2026-07-13T10:00:00.000Z",
        sources: [],
      },
      salaryAggregates: {
        state: "ready",
        data: [
          aggregate("2026-07-11T00:00:00.000Z"),
          aggregate("2026-07-12T00:00:00.000Z"),
          aggregate("2026-07-13T00:00:00.000Z", "GH"),
        ],
        issues: [],
      },
      companies: {
        state: "ready",
        data: [
          company("padi-labs", [employerJob]),
          company("evidence-labs", [], "evidence-labs-id"),
          company("remote-only", [remotiveJob]),
          company("thin-profile", [], "thin-profile-id"),
        ],
        issues: [],
      },
      companyEvidence: [
        {
          companySlug: "evidence-labs",
          lastModified: "2026-07-12T12:00:00.000Z",
        },
      ],
    });

    expect(result).toContainEqual(
      expect.objectContaining({
        url: "https://salarypadi.com/jobs/platform-engineer-padi",
        lastModified: "2026-07-13T00:00:00.000Z",
      }),
    );
    expect(result.some((entry) => entry.url.includes("remotive"))).toBe(false);
    expect(result.some((entry) => entry.url.includes("/salaries/gh/"))).toBe(
      false,
    );
    expect(result).toContainEqual(
      expect.objectContaining({
        url: "https://salarypadi.com/salaries/ng/product-manager",
        lastModified: "2026-07-12T00:00:00.000Z",
      }),
    );
    expect(
      result.filter(
        (entry) =>
          entry.url === "https://salarypadi.com/salaries/ng/product-manager",
      ),
    ).toHaveLength(1);
    expect(result.map((entry) => entry.url)).toEqual(
      expect.arrayContaining([
        "https://salarypadi.com/salaries",
        "https://salarypadi.com/companies",
        "https://salarypadi.com/companies/padi-labs",
        "https://salarypadi.com/companies/evidence-labs",
        "https://salarypadi.com/insights/source-freshness",
        "https://salarypadi.com/guides/remote-jobs-open-to-nigerians",
      ]),
    );
    expect(result.map((entry) => entry.url)).not.toEqual(
      expect.arrayContaining([
        "https://salarypadi.com/companies/remote-only",
        "https://salarypadi.com/companies/thin-profile",
        "https://salarypadi.com/contribute",
      ]),
    );
    expect(result.every((entry) => Boolean(entry.lastModified))).toBe(true);
    expect(
      result.every(
        (entry) =>
          !Object.values(entry.alternates?.languages ?? {}).some(
            (href) => typeof href === "string" && href.includes("/gh/"),
          ),
      ),
    ).toBe(true);
    const xml = renderSitemapXml(result);
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain('hreflang="en-NG"');
    expect(xml).toContain('hreflang="x-default"');
    expect(xml).not.toContain("/gh/");
  });

  it("keeps hubs and salary details out when their repositories are unavailable", () => {
    const result = buildSitemapEntries({
      origin: "https://salarypadi.com",
      editorial: [],
      jobFeed: {
        jobs: [],
        state: "unavailable",
        checkedAt: "2026-07-13T00:00:00.000Z",
        sources: [],
      },
      salaryAggregates: {
        state: "unavailable",
        data: [aggregate("2026-07-12T00:00:00.000Z")],
        issues: [],
      },
      companies: { state: "unavailable", data: [], issues: [] },
      companyEvidence: [],
    });

    expect(result.map((entry) => entry.url)).not.toEqual(
      expect.arrayContaining([
        "https://salarypadi.com/salaries",
        "https://salarypadi.com/salaries/ng/product-manager",
        "https://salarypadi.com/companies",
      ]),
    );
  });
});
