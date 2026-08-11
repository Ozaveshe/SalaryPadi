import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { getDuplicateCandidateDetailResult } from "@/lib/admin/duplicate-detail";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const mockedCreateClient = vi.mocked(createServerSupabaseClient);
const candidateId = "aa000000-0000-4000-8000-000000000030";

function clientReturning(data: unknown, error: unknown = null) {
  return {
    schema: () => ({
      rpc: () => Promise.resolve({ data, error }),
    }),
  } as never;
}

function validRow() {
  const side = (prefix: "first" | "second", suffix: string) => ({
    [`${prefix}_source_job_id`]: `aa000000-0000-4000-8000-00000000002${suffix}`,
    [`${prefix}_job_id`]: `aa000000-0000-4000-8000-00000000002${suffix}`,
    [`${prefix}_title`]: "Senior Platform Engineer",
    [`${prefix}_description`]: `A complete source description for side ${suffix}.`,
    [`${prefix}_company_name`]: "Evidence Company",
    [`${prefix}_status`]: "published",
    [`${prefix}_slug`]: `platform-engineer-${suffix}`,
    [`${prefix}_work_arrangement`]: "remote",
    [`${prefix}_employment_type`]: "full_time",
    [`${prefix}_engagement_type`]: "employee",
    [`${prefix}_experience_level`]: "senior",
    [`${prefix}_salary_min`]: "100000",
    [`${prefix}_salary_max`]: "150000",
    [`${prefix}_currency_code`]: "NGN",
    [`${prefix}_pay_period`]: "monthly",
    [`${prefix}_application_url`]: `https://example.test/apply/${suffix}`,
    [`${prefix}_source_url`]: `https://example.test/jobs/${suffix}`,
    [`${prefix}_posted_at`]: "2026-08-01T00:00:00+00:00",
    [`${prefix}_valid_through`]: null,
    [`${prefix}_last_seen_at`]: "2026-08-11T00:00:00+00:00",
    [`${prefix}_last_verified_at`]: null,
    [`${prefix}_locations`]: "Lagos, NG",
    [`${prefix}_eligibility_scope`]: "country_limited",
    [`${prefix}_eligibility_evidence`]: "Open to applicants in Nigeria.",
    [`${prefix}_eligibility_provenance`]: "source_explicit",
    [`${prefix}_source_name`]: "Employer careers",
    [`${prefix}_source_adapter`]: `employer_${suffix}`,
    [`${prefix}_source_authority`]: "employer_ats",
    [`${prefix}_source_terms_url`]: "https://example.test/terms",
    [`${prefix}_source_terms_reviewed_at`]: "2026-08-01T00:00:00+00:00",
  });
  return {
    candidate_id: candidateId,
    candidate_status: "pending",
    candidate_version: 1,
    title_similarity: "0.9875",
    detection_reason: "same company and similar title",
    left_application_host: "example.test",
    right_application_host: "example.test",
    candidate_created_at: "2026-08-11T00:00:00+00:00",
    candidate_reviewed_at: null,
    resolution_reason: null,
    canonical_job_id: null,
    ...side("first", "0"),
    ...side("second", "1"),
  };
}

describe("duplicate candidate detail repository", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("returns one validated, mapped comparison", async () => {
    mockedCreateClient.mockResolvedValue(clientReturning([validRow()]));

    await expect(
      getDuplicateCandidateDetailResult(candidateId),
    ).resolves.toMatchObject({
      state: "ready",
      data: {
        id: candidateId,
        titleSimilarity: 0.9875,
        first: { sourceAdapter: "employer_0", salaryMin: 100000 },
        second: { sourceAdapter: "employer_1", salaryMax: 150000 },
      },
    });
  });

  it("returns a real missing state when the protected function has no row", async () => {
    mockedCreateClient.mockResolvedValue(clientReturning([]));
    await expect(
      getDuplicateCandidateDetailResult(candidateId),
    ).resolves.toMatchObject({ state: "ready", data: null });
  });

  it("rejects an invalid route identity before creating a client", async () => {
    await expect(
      getDuplicateCandidateDetailResult("not-a-uuid"),
    ).resolves.toMatchObject({
      state: "invalid",
      issues: [{ code: "duplicate_candidate_id_invalid" }],
    });
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("fails closed when returned evidence does not match the contract", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning([{ ...validRow(), first_source_url: "not-a-url" }]),
    );
    await expect(
      getDuplicateCandidateDetailResult(candidateId),
    ).resolves.toMatchObject({
      state: "invalid",
      data: null,
      issues: [{ code: "duplicate_candidate_invalid_row" }],
    });
  });

  it("does not interpret a backend failure as a missing candidate", async () => {
    mockedCreateClient.mockResolvedValue(
      clientReturning(null, { code: "PGRST001" }),
    );
    await expect(
      getDuplicateCandidateDetailResult(candidateId),
    ).resolves.toMatchObject({
      state: "unavailable",
      data: null,
      issues: [{ code: "duplicate_candidate_query_failed" }],
    });
  });
});
