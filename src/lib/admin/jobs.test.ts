import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import {
  getAdminJobDetailResult,
  parseAdminJobSearch,
  searchAdminJobsResult,
} from "@/lib/admin/jobs";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const mockedCreateClient = vi.mocked(createServerSupabaseClient);
const jobId = "ac000000-0000-4000-8000-000000000020";

function clientReturning(data: unknown, error: unknown = null) {
  return {
    schema: () => ({ rpc: () => Promise.resolve({ data, error }) }),
  } as never;
}

function searchRow() {
  return {
    id: jobId,
    title: "Senior Platform Engineer",
    company_name: "Evidence Company",
    source_name: "Employer careers",
    source_adapter: "evidence_company",
    external_source_id: "vacancy-20",
    slug: "senior-platform-engineer",
    status: "pending",
    updated_at: "2026-08-11T00:00:00+00:00",
    version: 3,
    open_report_count: 1,
  };
}

function detailRow() {
  return {
    job_data: {
      id: jobId,
      version: 3,
      canonical_job_id: null,
      external_source_id: "vacancy-20",
      slug: "senior-platform-engineer",
      status: "pending",
      title: "Senior Platform Engineer",
      description: "A complete source-retained job description for review.",
      requirements: null,
      benefits: null,
      work_arrangement: "remote",
      employment_type: "full_time",
      engagement_type: "employee",
      experience_level: "senior",
      salary_min: "100000",
      salary_max: "150000",
      currency_code: "NGN",
      pay_period: "monthly",
      gross_net: "gross",
      bonus_text: null,
      application_url: "https://example.test/apply",
      source_url: "https://example.test/jobs/20",
      original_employer_url: null,
      posted_at: "2026-08-01T00:00:00+00:00",
      valid_through: null,
      last_seen_at: "2026-08-11T00:00:00+00:00",
      last_checked_at: "2026-08-11T00:00:00+00:00",
      last_verified_at: null,
      content_sanitized_at: "2026-08-11T00:00:00+00:00",
      dedup_fingerprint: "fingerprint",
      is_fixture: false,
      created_at: "2026-08-01T00:00:00+00:00",
      updated_at: "2026-08-11T00:00:00+00:00",
      lifecycle_state: "open",
      lifecycle_reason: null,
      manual_reconfirmed_at: null,
      apply_link_state: "healthy",
      apply_link_checked_at: "2026-08-11T00:00:00+00:00",
      public_ready_until: "2026-09-01T00:00:00+00:00",
      application_destination_kind: "employer_application_url",
    },
    company_data: {
      id: "ac000000-0000-4000-8000-000000000010",
      slug: "evidence-company",
      display_name: "Evidence Company",
      website_url: "https://example.test",
      website_domain: "example.test",
      verification_status: "domain_verified",
      record_status: "published",
    },
    source_data: {
      id: "ac000000-0000-4000-8000-000000000011",
      name: "Employer careers",
      adapter_key: "evidence_company",
      source_type: "employer_ats",
      status: "active",
      authority: "employer_ats",
      policy_state: "enabled",
      terms_url: "https://example.test/terms",
      terms_reviewed_at: "2026-08-01T00:00:00+00:00",
      terms_version: "terms-v1",
      allow_public_listing: true,
      may_index_jobs: true,
      may_emit_jobposting_schema: true,
      may_email_jobs: true,
      authorization_basis: "documented_public_api",
      authorization_evidence_ref: "board-registry:evidence-company",
      authorization_reviewed_at: "2026-08-01T00:00:00+00:00",
      authorization_expires_at: null,
      authorization_revoked_at: null,
    },
    locations_data: [
      {
        country_code: "NG",
        city: "Lagos",
        region: "Lagos",
        is_primary: true,
        source_location_text: "Lagos, Nigeria",
      },
    ],
    eligibility_data: {
      scope: "nigeria",
      required_timezone_overlap: null,
      work_authorization_requirement: null,
      visa_sponsorship: false,
      relocation_support: null,
      evidence_text: "Open to applicants in Nigeria.",
      provenance: "source_provided",
      confidence: "1",
      last_verified_at: "2026-08-11T00:00:00+00:00",
      region_wording: null,
      physical_location_requirement: null,
      arrangement_evidence: "Source labels the role remote.",
    },
    publication_blockers: [],
    open_report_count: 1,
    report_count: 2,
    duplicate_candidate_count: 1,
  };
}

describe("admin job repository", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("validates request-time search parameters", () => {
    expect(parseAdminJobSearch({ q: "a" }).success).toBe(false);
    expect(
      parseAdminJobSearch({ q: " platform ", status: "pending" }),
    ).toMatchObject({
      success: true,
      data: { query: "platform", status: "pending" },
    });
    expect(parseAdminJobSearch({ status: "invented" }).success).toBe(false);
  });

  it("returns validated searchable job rows", async () => {
    mockedCreateClient.mockResolvedValue(clientReturning([searchRow()]));
    await expect(
      searchAdminJobsResult({ query: "platform", status: null }),
    ).resolves.toMatchObject({
      state: "ready",
      data: [{ id: jobId, open_report_count: 1 }],
    });
  });

  it("fails closed on a mixed or oversized search contract", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning([searchRow(), { ...searchRow(), id: "not-a-uuid" }]),
    );
    await expect(
      searchAdminJobsResult({ query: "platform", status: null }),
    ).resolves.toMatchObject({
      state: "invalid",
      data: [],
      issues: [{ code: "admin_job_search_invalid_rows" }],
    });
  });

  it("returns one strict, evidence-rich job detail", async () => {
    mockedCreateClient.mockResolvedValue(clientReturning([detailRow()]));
    await expect(getAdminJobDetailResult(jobId)).resolves.toMatchObject({
      state: "ready",
      data: {
        job_data: { salary_min: 100000, status: "pending" },
        source_data: { authority: "employer_ats" },
        eligibility_data: { confidence: 1 },
        open_report_count: 1,
      },
    });
  });

  it("distinguishes a missing job from a failed detail read", async () => {
    mockedCreateClient.mockResolvedValueOnce(clientReturning([]));
    await expect(getAdminJobDetailResult(jobId)).resolves.toMatchObject({
      state: "ready",
      data: null,
    });

    mockedCreateClient.mockResolvedValueOnce(
      clientReturning(null, { code: "PGRST001" }),
    );
    await expect(getAdminJobDetailResult(jobId)).resolves.toMatchObject({
      state: "unavailable",
      data: null,
      issues: [{ code: "admin_job_detail_failed" }],
    });
  });

  it("validates the route UUID and strict detail payload", async () => {
    await expect(getAdminJobDetailResult("not-a-uuid")).resolves.toMatchObject({
      state: "invalid",
      issues: [{ code: "admin_job_id_invalid" }],
    });
    expect(mockedCreateClient).not.toHaveBeenCalled();

    mockedCreateClient.mockResolvedValue(
      clientReturning([
        {
          ...detailRow(),
          source_data: { ...detailRow().source_data, unexpected: true },
        },
      ]),
    );
    await expect(getAdminJobDetailResult(jobId)).resolves.toMatchObject({
      state: "invalid",
      issues: [{ code: "admin_job_detail_invalid_row" }],
    });
  });
});
