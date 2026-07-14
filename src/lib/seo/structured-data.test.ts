import { describe, expect, it } from "vitest";

import type { CompanyRating, CompanySummary } from "@/lib/companies/repository";

import {
  buildBreadcrumbStructuredData,
  buildCompanyAggregateRatingStructuredData,
} from "./structured-data";

const company: CompanySummary = {
  databaseId: "7d74e9e5-c76b-469f-90e0-2d45bc89fd2e",
  name: "Padi Labs",
  slug: "padi-labs",
  websiteUrl: "https://example.com",
  industry: "Technology",
  sizeBand: "51-200",
  description: "A reviewed company.",
  headquartersCountry: "NG",
  legalEntities: [],
  aliases: [],
  officialDomains: [],
  citations: [],
  activeJobs: [],
  categories: [],
  remoteLocations: [],
  verification: "employer_verified",
  lastCheckedAt: "2026-07-12T00:00:00.000Z",
};

const rating: CompanyRating = {
  company_slug: "padi-labs",
  sample_size: 5,
  overall_rating: 4.2,
  confidence_label: "low",
  computed_at: "2026-07-12T00:00:00.000Z",
};

describe("shared structured-data builders", () => {
  it("builds ordered BreadcrumbList data for detail pages", () => {
    expect(
      buildBreadcrumbStructuredData([
        { name: "Home", url: "https://salarypadi.com" },
        { name: "Companies", url: "https://salarypadi.com/companies" },
        {
          name: "Padi Labs",
          url: "https://salarypadi.com/companies/padi-labs",
        },
      ]),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://salarypadi.com",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Companies",
          item: "https://salarypadi.com/companies",
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "Padi Labs",
          item: "https://salarypadi.com/companies/padi-labs",
        },
      ],
    });
  });

  it("emits AggregateRating only from a snapshot meeting the live threshold", () => {
    expect(
      buildCompanyAggregateRatingStructuredData(
        company,
        "https://salarypadi.com/companies/padi-labs",
        rating,
        5,
      ),
    ).toMatchObject({
      "@type": "Organization",
      name: "Padi Labs",
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: 4.2,
        ratingCount: 5,
        bestRating: 5,
        worstRating: 1,
      },
    });
  });

  it("fails closed when the snapshot or current threshold is insufficient", () => {
    expect(
      buildCompanyAggregateRatingStructuredData(
        company,
        "https://salarypadi.com/companies/padi-labs",
        { ...rating, sample_size: 4 },
        5,
      ),
    ).toBeNull();
    expect(
      buildCompanyAggregateRatingStructuredData(
        company,
        "https://salarypadi.com/companies/padi-labs",
        rating,
        null,
      ),
    ).toBeNull();
    expect(
      buildCompanyAggregateRatingStructuredData(
        company,
        "https://salarypadi.com/companies/padi-labs",
        null,
        5,
      ),
    ).toBeNull();
  });
});
