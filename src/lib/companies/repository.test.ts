import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock("@/lib/jobs/repository", () => ({
  getLiveJobFeed: vi.fn(),
}));

import {
  getCompaniesResult,
  getCompanyBenefitsResult,
  getCompanyRatingMinimumSampleResult,
  getCompanyRatingResult,
  getCompanyResult,
  getCompanyReviewsResult,
  getInterviewExperiencesResult,
  getPublishedCompanyEvidenceResult,
} from "@/lib/companies/repository";
import { getLiveJobFeed } from "@/lib/jobs/repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const mockedCreateClient = vi.mocked(createServerSupabaseClient);
const mockedJobFeed = vi.mocked(getLiveJobFeed);

function clientReturning(data: unknown, error: unknown = null) {
  const query = {
    select: () => query,
    order: () => query,
    eq: () => query,
    limit: async () => ({ data, error }),
  };
  return { schema: () => ({ from: () => query }) } as never;
}

function clientReturningSingle(data: unknown, error: unknown = null) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data, error }),
  };
  return { schema: () => ({ from: () => query }) } as never;
}

function discoveryClientReturning(rows: Record<string, unknown[]>) {
  return {
    schema: () => ({
      from: (table: string) => {
        const query = {
          select: () => query,
          eq: () => query,
          not: () => query,
          order: () => query,
          range: async () => ({ data: rows[table] ?? [], error: null }),
        };
        return query;
      },
    }),
  } as never;
}

const disabledFeed = {
  jobs: [],
  state: "disabled" as const,
  checkedAt: "2026-07-11T00:00:00.000Z",
  sources: [],
};

const validCompany = {
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
  locations: [],
};

const validReview = {
  id: "831d18d7-21f7-46d1-90b4-47b5fc96d914",
  company_slug: "acme",
  role_family: "Engineering",
  country_code: "NG",
  employment_status: "current",
  employment_period_label: "2025-2026",
  compensation_rating: 4,
  pay_reliability_rating: 5,
  management_rating: 4,
  work_life_rating: 3,
  career_growth_rating: 4,
  overall_rating: 4,
  pros: "Clear goals",
  cons: "Busy periods",
  advice_to_management: null,
  published_at: "2026-07-11T00:00:00.000Z",
};

const validInterview = {
  id: "0f046c9e-090b-45d1-ae2d-18e5e64b70f4",
  company_slug: "acme",
  role_family: "Engineering",
  seniority: "mid",
  country_code: "NG",
  application_source: "Careers page",
  stages: ["Screen", "Interview"],
  approximate_duration_label: "Two weeks",
  difficulty: 3,
  feedback_received: true,
  outcome: "offer",
  question_themes: "System design",
  general_experience: "Structured",
  published_at: "2026-07-11T00:00:00.000Z",
};

const validRating = {
  company_slug: "acme",
  sample_size: 5,
  overall_rating: 4.2,
  confidence_label: "medium",
  computed_at: "2026-07-11T00:00:00.000Z",
};

const validBenefit = {
  id: "74e553e9-49f1-46ed-9afa-d3280dc60e62",
  company_slug: "acme",
  benefit_code: "health",
  label: "Health insurance",
  description: "Employee cover",
  source_kind: "moderated_report",
  sample_size: 5,
  confidence_label: "medium",
  last_verified_at: "2026-07-11T00:00:00.000Z",
};

describe("companies repository", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedJobFeed.mockResolvedValue(disabledFeed);
  });

  it("distinguishes an unconfigured company store from an empty directory", async () => {
    mockedCreateClient.mockResolvedValue(null);
    const result = await getCompaniesResult();
    expect(result.state).toBe("unconfigured");
    expect(result.data).toEqual([]);
  });

  it("returns validated company records", async () => {
    mockedCreateClient.mockResolvedValue(clientReturning([validCompany]));
    const result = await getCompaniesResult();
    expect(result.state).toBe("ready");
    expect(result.data[0]).toMatchObject({
      name: "Acme",
      verification: "employer_verified",
    });
  });

  it("quarantines malformed companies without discarding valid records", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning([validCompany, { id: "broken" }]),
    );
    const result = await getCompaniesResult();
    expect(result.state).toBe("degraded");
    expect(result.data).toHaveLength(1);
    expect(result.issues[0]?.code).toBe("companies_invalid_rows");
  });

  it("does not turn a database outage into an empty company directory", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning(null, { message: "database unavailable" }),
    );
    const result = await getCompaniesResult();
    expect(result.state).toBe("unavailable");
    expect(result.issues[0]?.code).toBe("companies_query_failed");
  });

  it("preserves feed companies when the reviewed company store is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(null);
    mockedJobFeed.mockResolvedValue({
      ...disabledFeed,
      state: "degraded",
      jobs: [
        {
          id: "job-1",
          databaseId: null,
          slug: "engineer-acme",
          externalId: "external-1",
          source: {
            id: "source-1",
            name: "Source",
            type: "permitted_api",
            termsUrl: "https://example.com/terms",
            termsReviewedAt: "2026-07-11",
            attributionRequired: "Attribution required",
            canStoreFullDescription: true,
            canIndex: false,
            canUseJobPostingStructuredData: false,
            canEmail: false,
            destinationRequirement: "https",
            refreshIntervalSeconds: 43_200,
          },
          sourceUrl: "https://example.com/job",
          applicationUrl: "https://example.com/apply",
          title: "Engineer",
          company: {
            name: "Acme",
            slug: "acme",
            verification: "source_listed",
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
            africa: "unclear",
            includedCountries: ["Nigeria"],
            excludedCountries: [],
            requiredTimezone: null,
            workAuthorization: null,
            visaSponsorship: "unclear",
            relocationSupport: "unclear",
            evidenceText: "Nigeria listed",
            provenance: "source_provided",
            lastVerifiedAt: "2026-07-11T00:00:00.000Z",
          },
          description: "Role description",
          requirements: null,
          benefits: null,
          postedAt: "2026-07-10T00:00:00.000Z",
          lastCheckedAt: "2026-07-11T00:00:00.000Z",
          validThrough: null,
          status: "open",
          riskIndicators: [],
          fingerprint: "fingerprint-1",
        },
      ],
      sources: [
        {
          key: "database",
          state: "unavailable",
          checkedAt: "2026-07-11T00:00:00.000Z",
          count: 0,
          code: "database_unavailable",
        },
      ],
    });
    const result = await getCompaniesResult();
    expect(result.state).toBe("degraded");
    expect(result.data[0]?.name).toBe("Acme");
  });

  it("maps a single company lookup without erasing repository state", async () => {
    mockedCreateClient.mockResolvedValue(clientReturning([validCompany]));
    const result = await getCompanyResult("acme");
    expect(result.state).toBe("ready");
    expect(result.data?.slug).toBe("acme");
  });

  it("validates each company intelligence projection", async () => {
    mockedCreateClient
      .mockResolvedValueOnce(clientReturning([validReview]))
      .mockResolvedValueOnce(clientReturning([validInterview]))
      .mockResolvedValueOnce(clientReturning([validRating]))
      .mockResolvedValueOnce(clientReturning([validBenefit]));

    expect((await getCompanyReviewsResult("acme")).data).toEqual([validReview]);
    expect((await getInterviewExperiencesResult("acme")).data).toEqual([
      validInterview,
    ]);
    expect((await getCompanyRatingResult("acme")).data).toEqual(validRating);
    expect((await getCompanyBenefitsResult("acme")).data).toEqual([
      validBenefit,
    ]);
  });

  it("reads the active company-rating sample threshold", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturningSingle({
        metric: "company_overall_rating",
        min_distinct_contributors: 5,
      }),
    );

    expect((await getCompanyRatingMinimumSampleResult()).data).toBe(5);
  });

  it("summarizes only published community evidence for sitemap discovery", async () => {
    mockedCreateClient.mockResolvedValue(
      discoveryClientReturning({
        company_reviews: [
          {
            company_slug: "acme",
            published_at: "2026-07-11T00:00:00.000Z",
          },
        ],
        interview_experiences: [],
        company_ratings: [
          {
            company_slug: "acme",
            computed_at: "2026-07-12T00:00:00.000Z",
          },
        ],
        company_benefits: [
          {
            company_slug: "community-co",
            source_kind: "community_reported",
            last_verified_at: "2026-07-10T00:00:00.000Z",
          },
          {
            company_slug: "public-fact-co",
            source_kind: "public_fact",
            last_verified_at: "2026-07-13T00:00:00.000Z",
          },
        ],
        salary_aggregates: [
          {
            company_slug: null,
            calculated_at: "2026-07-13T00:00:00.000Z",
          },
        ],
      }),
    );

    expect((await getPublishedCompanyEvidenceResult()).data).toEqual([
      {
        companySlug: "acme",
        lastModified: "2026-07-12T00:00:00.000Z",
      },
      {
        companySlug: "community-co",
        lastModified: "2026-07-10T00:00:00.000Z",
      },
    ]);
  });

  it("marks malformed company intelligence as degraded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning([validReview, { id: "broken" }]),
    );
    const result = await getCompanyReviewsResult("acme");
    expect(result.state).toBe("degraded");
    expect(result.data).toHaveLength(1);
  });
});
