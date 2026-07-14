import { describe, expect, it } from "vitest";

import {
  benefitSchema,
  companyCitationSchema,
  companyRowSchema,
  employerResponseSchema,
  ratingSchema,
  reviewSchema,
} from "./contracts";

describe("company intelligence public contracts", () => {
  it("rejects a rating below five independent reviews", () => {
    expect(
      ratingSchema.safeParse({
        company_slug: "acme",
        sample_size: 4,
        overall_rating: 4.9,
        confidence_label: "low",
        computed_at: "2026-07-14T00:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("accepts only an approved factual source kind", () => {
    const base = {
      id: "7d74e9e5-c76b-469f-90e0-2d45bc89fd2e",
      fact_key: "website",
      source_url: "https://example.com/about",
      source_title: "Official company page",
      source_published_at: null,
      retrieved_at: "2026-07-14T00:00:00Z",
      fact_checked_at: "2026-07-14T00:00:00Z",
      review_due_at: "2027-01-14T00:00:00Z",
      status: "current",
    };
    expect(
      companyCitationSchema.safeParse({ ...base, source_kind: "official_site" })
        .success,
    ).toBe(true);
    expect(
      companyCitationSchema.safeParse({ ...base, source_kind: "review_site" })
        .success,
    ).toBe(false);
  });

  it("rejects impossible evidence chronology", () => {
    const citation = {
      id: "7d74e9e5-c76b-469f-90e0-2d45bc89fd2e",
      fact_key: "website",
      source_kind: "official_site",
      source_url: "https://example.com/about",
      source_title: "Official company page",
      source_published_at: "2026-07-15",
      retrieved_at: "2026-07-14T00:00:00Z",
      fact_checked_at: "2026-07-13T00:00:00Z",
      review_due_at: "2026-07-12T00:00:00Z",
      status: "current",
    };

    expect(companyCitationSchema.safeParse(citation).success).toBe(false);
  });

  it("keeps employer responses anonymous at the public boundary", () => {
    const response = employerResponseSchema.parse({
      id: "7d74e9e5-c76b-469f-90e0-2d45bc89fd2e",
      company_slug: "acme",
      response_kind: "right_of_reply",
      statement: "We have updated the published policy.",
      source_url: "https://example.com/policy",
      published_at: "2026-07-14T00:00:00Z",
      updated_at: "2026-07-14T00:00:00Z",
      provenance_label: "Verified employer response",
      author_user_id: "private-user-id",
      work_email: "person@example.com",
    });

    expect(response).not.toHaveProperty("author_user_id");
    expect(response).not.toHaveProperty("work_email");
  });

  it("rejects non-HTTPS links before company evidence is rendered", () => {
    const citation = {
      id: "7d74e9e5-c76b-469f-90e0-2d45bc89fd2e",
      fact_key: "website",
      source_kind: "official_site",
      source_url: "javascript:alert(1)",
      source_title: "Unsafe evidence",
      source_published_at: null,
      retrieved_at: "2026-07-14T00:00:00Z",
      fact_checked_at: "2026-07-14T00:00:00Z",
      review_due_at: "2027-01-14T00:00:00Z",
      status: "current",
    };
    const response = {
      id: "7d74e9e5-c76b-469f-90e0-2d45bc89fd2e",
      company_slug: "acme",
      response_kind: "right_of_reply",
      statement: "We have updated the published policy.",
      source_url: "http://example.com/policy",
      published_at: "2026-07-14T00:00:00Z",
      updated_at: "2026-07-14T00:00:00Z",
      provenance_label: "Verified employer response",
    };

    expect(companyCitationSchema.safeParse(citation).success).toBe(false);
    expect(employerResponseSchema.safeParse(response).success).toBe(false);
  });

  it("rejects impossible ratings and malformed publication timestamps", () => {
    expect(
      reviewSchema.safeParse({
        id: "7d74e9e5-c76b-469f-90e0-2d45bc89fd2e",
        company_slug: "acme",
        role_family: "Engineering",
        country_code: "NG",
        employment_status: "current",
        employment_period_label: "2025-2026",
        compensation_rating: 6,
        pay_reliability_rating: 5,
        management_rating: 4,
        work_life_rating: 3,
        career_growth_rating: 4,
        overall_rating: 4,
        pros: null,
        cons: null,
        advice_to_management: null,
        published_at: "not-a-timestamp",
        provenance_label: "Moderated",
      }).success,
    ).toBe(false);
    expect(
      ratingSchema.safeParse({
        company_slug: "acme",
        sample_size: 5,
        independent_contributors: 6,
        overall_rating: 4.5,
        confidence_label: "medium",
        source_month_from: "2026-06-01",
        source_month_to: "2026-05-01",
        computed_at: "2026-07-14T00:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("rejects inverted benefit evidence windows", () => {
    expect(
      benefitSchema.safeParse({
        id: "7d74e9e5-c76b-469f-90e0-2d45bc89fd2e",
        company_slug: "acme",
        benefit_code: "hmo",
        label: "Health insurance",
        description: null,
        source_kind: "community_reported",
        sample_size: 5,
        confidence_label: "medium",
        last_verified_at: "2026-07-14T00:00:00Z",
        country_code: "NG",
        source_month_from: "2026-06-01",
        source_month_to: "2026-05-01",
      }).success,
    ).toBe(false);
  });

  it("preserves an explicitly withheld country on privacy-gated evidence", () => {
    const review = {
      id: "7d74e9e5-c76b-469f-90e0-2d45bc89fd2e",
      company_slug: "acme",
      role_family: null,
      country_code: "WITHHELD",
      employment_status: null,
      employment_period_label: null,
      compensation_rating: null,
      pay_reliability_rating: null,
      management_rating: null,
      work_life_rating: null,
      career_growth_rating: null,
      overall_rating: null,
      pros: null,
      cons: null,
      advice_to_management: null,
      published_at: "2026-07-14T00:00:00Z",
      provenance_label: "First-party, moderated; identity withheld",
    };

    expect(reviewSchema.safeParse(review).success).toBe(true);
    expect(
      reviewSchema.safeParse({ ...review, country_code: "UNKNOWN" }).success,
    ).toBe(false);
  });

  it("defaults omitted company evidence but rejects malformed supplied evidence", () => {
    const company = {
      id: "7d74e9e5-c76b-469f-90e0-2d45bc89fd2e",
      slug: "acme",
      display_name: "Acme",
      website_url: "https://example.com",
      industry: "Technology",
      size_band: "51-200",
      description: "A reviewed company.",
      headquarters_country: "NG",
      verification_status: "domain_verified",
      updated_at: "2026-07-11T00:00:00.000Z",
    };

    expect(companyRowSchema.parse(company).citations).toEqual([]);
    expect(
      companyRowSchema.safeParse({ ...company, citations: "not-an-array" })
        .success,
    ).toBe(false);
    expect(
      companyRowSchema.safeParse({
        ...company,
        website_url: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      companyRowSchema.safeParse({
        ...company,
        locations: Array.from({ length: 101 }, () => ({
          country_code: "NG",
        })),
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate or dangling company evidence references", () => {
    const citation = {
      id: "7d74e9e5-c76b-469f-90e0-2d45bc89fd2e",
      fact_key: "official_domain",
      source_kind: "official_site",
      source_url: "https://example.com/about",
      source_title: "Official company page",
      source_published_at: null,
      retrieved_at: "2026-07-14T00:00:00Z",
      fact_checked_at: "2026-07-14T00:00:00Z",
      review_due_at: "2027-01-14T00:00:00Z",
      status: "current",
    };
    const company = {
      id: "6d74e9e5-c76b-469f-90e0-2d45bc89fd2e",
      slug: "acme",
      display_name: "Acme",
      website_url: "https://example.com",
      industry: "Technology",
      size_band: "51-200",
      description: "A reviewed company.",
      headquarters_country: "NG",
      verification_status: "domain_verified",
      updated_at: "2026-07-14T00:00:00Z",
      citations: [citation, citation],
      official_domains: [
        {
          domain: "example.com",
          domain_kind: "corporate",
          verified_at: "2026-07-14T00:00:00Z",
          review_due_at: "2027-01-14T00:00:00Z",
          citation_id: "00000000-0000-4000-8000-000000000001",
        },
      ],
    };

    expect(companyRowSchema.safeParse(company).success).toBe(false);
  });
});
