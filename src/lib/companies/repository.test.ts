import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
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
import { unstable_rethrow } from "next/navigation";

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

function clientReturningWithLimit(data: unknown, error: unknown = null) {
  const limit = vi.fn().mockResolvedValue({ data, error });
  const query = {
    select: () => query,
    order: () => query,
    eq: () => query,
    limit,
  };
  return {
    client: { schema: () => ({ from: () => query }) } as never,
    limit,
  };
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

function intelligenceClientThrowing(failure: Error) {
  const query = {
    select: () => query,
    eq: () => query,
    limit: async () => Promise.reject(failure),
  };
  return { schema: () => ({ from: () => query }) } as never;
}

function discoveryClientFailing(failedTables: ReadonlySet<string>) {
  return {
    schema: () => ({
      from: (table: string) => {
        const query = {
          select: () => query,
          eq: () => query,
          not: () => query,
          order: () => query,
          range: async () =>
            failedTables.has(table)
              ? { data: null, error: new Error(`${table} unavailable`) }
              : { data: [], error: null },
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
  provenance_label: "First-party, moderated; identity withheld",
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
  provenance_label:
    "First-party, moderated; identity and rare attributes withheld",
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
    vi.mocked(unstable_rethrow).mockReset();
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

  it("labels cited factual shells as source listed without implying employer verification", async () => {
    const citedCompany = {
      ...validCompany,
      verification_status: "unverified",
      citations: [
        {
          id: "a8bb25d5-9be0-4532-881c-6e833e6f0c44",
          fact_key: "official_domain",
          source_kind: "official_site",
          source_url: "https://example.com/",
          source_title: "Acme official website",
          source_published_at: null,
          retrieved_at: "2026-07-14T00:00:00.000Z",
          fact_checked_at: "2026-07-14T00:00:00.000Z",
          review_due_at: "2027-01-14T00:00:00.000Z",
          status: "current",
        },
      ],
    };
    mockedCreateClient.mockResolvedValue(clientReturning([citedCompany]));
    const result = await getCompaniesResult();
    expect(result.data[0]?.verification).toBe("source_listed");
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

  it("does not silently collapse duplicate or overflowing company rows", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store = clientReturningWithLimit(Array(501).fill(validCompany));
    mockedCreateClient.mockResolvedValue(store.client);

    const result = await getCompaniesResult(disabledFeed);

    expect(result.state).toBe("degraded");
    expect(result.data).toHaveLength(1);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "companies_duplicate_slugs" }),
        expect.objectContaining({ code: "companies_capacity_exceeded" }),
      ]),
    );
    expect(store.limit).toHaveBeenCalledWith(501);
  });

  it("does not silently erase malformed nested company evidence", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning([{ ...validCompany, citations: "not-an-array" }]),
    );

    const result = await getCompaniesResult(disabledFeed);

    expect(result.state).toBe("unavailable");
    expect(result.data).toEqual([]);
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

  it("keeps privacy-withheld review and interview countries explicit", async () => {
    const withheldReview = { ...validReview, country_code: "WITHHELD" };
    const withheldInterview = { ...validInterview, country_code: "WITHHELD" };
    mockedCreateClient
      .mockResolvedValueOnce(clientReturning([withheldReview]))
      .mockResolvedValueOnce(clientReturning([withheldInterview]));

    await expect(getCompanyReviewsResult("acme")).resolves.toMatchObject({
      state: "ready",
      data: [withheldReview],
    });
    await expect(getInterviewExperiencesResult("acme")).resolves.toMatchObject({
      state: "ready",
      data: [withheldInterview],
    });
  });

  it("reports bounded company-intelligence overflow explicitly", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reviews = clientReturningWithLimit(
      Array.from({ length: 101 }, (_, index) => ({
        ...validReview,
        id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      })),
    );
    mockedCreateClient.mockResolvedValueOnce(reviews.client);

    const reviewResult = await getCompanyReviewsResult("acme");

    expect(reviewResult.state).toBe("degraded");
    expect(reviewResult.data).toHaveLength(100);
    expect(reviewResult.issues).toContainEqual(
      expect.objectContaining({
        code: "company_intelligence_capacity_exceeded",
      }),
    );
    expect(reviews.limit).toHaveBeenCalledWith(101);

    const ratings = clientReturningWithLimit([validRating, validRating]);
    mockedCreateClient.mockResolvedValueOnce(ratings.client);
    const ratingResult = await getCompanyRatingResult("acme");

    expect(ratingResult).toMatchObject({ state: "invalid", data: null });
    expect(ratings.limit).toHaveBeenCalledWith(2);
  });

  it("quarantines duplicate company-intelligence identities", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      clientReturning([validReview, validReview]),
    );

    await expect(getCompanyReviewsResult("acme")).resolves.toMatchObject({
      state: "degraded",
      data: [validReview],
      issues: [{ code: "company_intelligence_duplicate_rows" }],
    });
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

  it("degrades and excludes invalid slugs or future-dated discovery evidence", async () => {
    mockedCreateClient.mockResolvedValue(
      discoveryClientReturning({
        company_reviews: [
          {
            company_slug: "valid-co",
            published_at: "2026-07-11T00:00:00.000Z",
          },
          {
            company_slug: "Invalid Slug",
            published_at: "2026-07-11T00:00:00.000Z",
          },
          {
            company_slug: "future-co",
            published_at: "2026-07-14T00:06:00.000Z",
          },
        ],
      }),
    );

    const result = await getPublishedCompanyEvidenceResult(
      new Date("2026-07-14T00:00:00.000Z"),
    );

    expect(result.state).toBe("degraded");
    expect(result.data).toEqual([
      {
        companySlug: "valid-co",
        lastModified: "2026-07-11T00:00:00.000Z",
      },
    ]);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "company_discovery_invalid_rows" }),
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

  it("maps a thrown company-client bootstrap failure to unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("company client failed");
    mockedCreateClient.mockRejectedValue(failure);

    await expect(getCompaniesResult(disabledFeed)).resolves.toMatchObject({
      state: "unavailable",
      data: [],
      issues: [{ code: "companies_query_failed" }],
    });
    expect(unstable_rethrow).toHaveBeenCalledWith(failure);
  });

  it("maps a thrown intelligence query transport to unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("intelligence transport failed");
    mockedCreateClient.mockResolvedValue(intelligenceClientThrowing(failure));

    await expect(getCompanyReviewsResult("acme")).resolves.toMatchObject({
      state: "unavailable",
      data: [],
      issues: [{ code: "company_intelligence_query_failed" }],
    });
    expect(unstable_rethrow).toHaveBeenCalledWith(failure);
  });

  it("marks discovery unavailable when every evidence table fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      discoveryClientFailing(
        new Set([
          "company_reviews",
          "interview_experiences",
          "company_ratings",
          "company_benefits",
          "salary_aggregates",
          "employer_responses",
        ]),
      ),
    );

    const result = await getPublishedCompanyEvidenceResult();

    expect(result.state).toBe("unavailable");
    expect(result.data).toEqual([]);
    expect(result.issues).toHaveLength(6);
  });

  it("keeps discovery degraded when at least one evidence table succeeds", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateClient.mockResolvedValue(
      discoveryClientFailing(new Set(["company_reviews"])),
    );

    const result = await getPublishedCompanyEvidenceResult();

    expect(result.state).toBe("degraded");
    expect(result.data).toEqual([]);
    expect(result.issues).toHaveLength(1);
  });
});
