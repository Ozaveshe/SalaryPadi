import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/career/repository", () => ({
  getSavedJobs: vi.fn(),
  getApplications: vi.fn(),
  getAlerts: vi.fn(),
  getCandidateProfile: vi.fn(),
}));

import {
  getDashboardSummary,
  MATCHING_FIELD_COUNT,
  missingMatchingFields,
} from "@/lib/career/dashboard";
import {
  getAlerts,
  getApplications,
  getCandidateProfile,
  getSavedJobs,
  type CandidateProfileRow,
} from "@/lib/career/repository";
import { STALE_APPLICATION_MS } from "@/lib/career/pipeline";
import {
  repositoryDegraded,
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
  type RepositoryReadState,
} from "@/lib/data/repository-result";

const NOW = Date.parse("2026-07-28T09:30:00.000Z");

type ApplicationRow = {
  id: string;
  job_slug: string;
  title: string;
  company_name: string;
  status: string;
  private_notes: string | null;
  next_action_at: string | null;
  updated_at: string;
};

function application(overrides: Partial<ApplicationRow> = {}): ApplicationRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    job_slug: "senior-engineer",
    title: "Senior Engineer",
    company_name: "Test Employer",
    status: "applied",
    private_notes: null,
    next_action_at: null,
    updated_at: "2026-07-27T00:00:00.000Z",
    ...overrides,
  };
}

function savedJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    job_slug: "product-designer",
    title: "Product Designer",
    company_name: "Test Employer",
    source_name: "Test Source",
    saved_at: "2026-07-26T00:00:00.000Z",
    ...overrides,
  };
}

function profileRow(
  overrides: Partial<CandidateProfileRow> = {},
): CandidateProfileRow {
  return {
    headline: "Backend engineer",
    summary: null,
    years_experience: 6,
    experience_level: "senior",
    desired_work_arrangement: "remote",
    desired_salary_min: 900_000,
    desired_salary_max: null,
    desired_currency_code: "NGN",
    desired_pay_period: "monthly",
    location_country: "NG",
    open_to_relocation: false,
    attested_at: "2026-07-20T00:00:00.000Z",
    updated_at: "2026-07-20T00:00:00.000Z",
    ...overrides,
  };
}

/** Every read succeeds and returns nothing unless a test says otherwise. */
function stubReads({
  saved = [] as ReturnType<typeof savedJob>[],
  applications = [] as ApplicationRow[],
  alerts = [] as { active: boolean }[],
  profile = null as CandidateProfileRow | null,
} = {}) {
  vi.mocked(getSavedJobs).mockResolvedValue(repositoryReady(saved) as never);
  vi.mocked(getApplications).mockResolvedValue(
    repositoryReady(applications) as never,
  );
  vi.mocked(getAlerts).mockResolvedValue(repositoryReady(alerts) as never);
  vi.mocked(getCandidateProfile).mockResolvedValue(repositoryReady(profile));
}

beforeEach(() => {
  vi.clearAllMocks();
  stubReads();
});

describe("dashboard read state", () => {
  it("reports the weakest state any section reached", async () => {
    stubReads();
    vi.mocked(getAlerts).mockResolvedValue(
      repositoryFailure(
        "unavailable",
        [],
        repositoryIssue(
          "get_my_job_alerts",
          "query_failed",
          "career_rpc_error",
        ),
      ) as never,
    );

    const summary = await getDashboardSummary(NOW);

    expect(summary.state).toBe("unavailable");
    expect(summary.alerts).toEqual({ state: "unavailable", data: null });
  });

  it("never greets a failed read as a fresh account", async () => {
    // A failed read also reports zero of everything. Treating that as a new
    // account would present missing data as an empty one.
    for (const state of ["unconfigured", "unavailable", "invalid"] as Exclude<
      RepositoryReadState,
      "ready" | "degraded"
    >[]) {
      stubReads();
      vi.mocked(getSavedJobs).mockResolvedValue(
        repositoryFailure(
          state,
          [],
          repositoryIssue(
            "get_my_saved_jobs",
            "query_failed",
            "career_rpc_error",
          ),
        ) as never,
      );

      const summary = await getDashboardSummary(NOW);

      expect(summary.state).toBe(state);
      expect(summary.savedJobs).toEqual({ state, data: null });
      expect(summary.isFirstRun).toBe(false);
    }
  });

  it("drops repository fallback data from every non-ready section", async () => {
    vi.mocked(getApplications).mockResolvedValue(
      repositoryFailure(
        "unavailable",
        [application()],
        repositoryIssue(
          "get_my_applications",
          "query_failed",
          "career_rpc_error",
        ),
      ) as never,
    );
    vi.mocked(getCandidateProfile).mockResolvedValue(
      repositoryDegraded(profileRow(), [
        repositoryIssue(
          "get_my_candidate_profile",
          "invalid_rows",
          "career_invalid_rows",
        ),
      ]),
    );

    const summary = await getDashboardSummary(NOW);

    // Even a provider fallback containing rows is not safe to count or render
    // after its read says it was incomplete.
    expect(summary.applications).toEqual({
      state: "unavailable",
      data: null,
    });
    expect(summary.profile).toEqual({ state: "degraded", data: null });
    expect(summary.isFirstRun).toBe(false);
  });

  it("reports a first run only when every read succeeded and found no career setup", async () => {
    expect((await getDashboardSummary(NOW)).isFirstRun).toBe(true);

    stubReads({ applications: [application({ status: "withdrawn" })] });
    expect((await getDashboardSummary(NOW)).isFirstRun).toBe(false);

    stubReads({ profile: profileRow() });
    expect((await getDashboardSummary(NOW)).isFirstRun).toBe(false);
  });
});

describe("scheduled actions", () => {
  it("orders every live action by instant, soonest first", async () => {
    stubReads({
      applications: [
        application({
          id: "a",
          job_slug: "later",
          next_action_at: "2026-07-31T00:00:00.000Z",
        }),
        application({
          id: "b",
          job_slug: "overdue",
          next_action_at: "2026-07-24T00:00:00.000Z",
        }),
        application({
          id: "c",
          job_slug: "today",
          next_action_at: "2026-07-28T18:00:00.000Z",
        }),
      ],
    });

    const summary = await getDashboardSummary(NOW);

    expect(
      summary.applications.data?.upcomingActions.map(
        (action) => action.jobSlug,
      ),
    ).toEqual(["overdue", "today", "later"]);
    expect(
      summary.applications.data?.upcomingActions.map(
        (action) => action.urgency,
      ),
    ).toEqual(["overdue", "today", "upcoming"]);
  });

  it("orders correctly across differing UTC offsets", async () => {
    // A lexical compare on the raw strings would put the +01:00 record first.
    stubReads({
      applications: [
        application({
          id: "a",
          job_slug: "second",
          next_action_at: "2026-08-02T00:30:00.000+01:00",
        }),
        application({
          id: "b",
          job_slug: "first",
          next_action_at: "2026-08-01T23:00:00.000Z",
        }),
      ],
    });

    const summary = await getDashboardSummary(NOW);

    expect(
      summary.applications.data?.upcomingActions.map(
        (action) => action.jobSlug,
      ),
    ).toEqual(["first", "second"]);
  });

  it("ignores dates on processes that have ended", async () => {
    stubReads({
      applications: [
        application({
          status: "rejected",
          next_action_at: "2026-07-24T00:00:00.000Z",
        }),
        application({
          id: "b",
          status: "withdrawn",
          next_action_at: "2026-07-25T00:00:00.000Z",
        }),
      ],
    });

    const summary = await getDashboardSummary(NOW);

    expect(summary.applications.data?.upcomingActions).toEqual([]);
    expect(summary.applications.data?.overdueActionCount).toBe(0);
  });

  it("counts every overdue action, including ones past the listed few", async () => {
    stubReads({
      applications: Array.from({ length: 6 }, (_, index) =>
        application({
          id: `id-${index}`,
          job_slug: `role-${index}`,
          next_action_at: `2026-07-2${index}T00:00:00.000Z`,
        }),
      ),
    });

    const summary = await getDashboardSummary(NOW);

    // Six dates, 20th-25th July, all before the 28th; only four are listed.
    expect(summary.applications.data?.upcomingActions).toHaveLength(4);
    expect(summary.applications.data?.overdueActionCount).toBe(6);
  });
});

describe("live application stages", () => {
  it("breaks the live count down by stage in funnel order, omitting empty stages", async () => {
    stubReads({
      applications: [
        application({ id: "a", status: "offer" }),
        application({ id: "b", status: "applied" }),
        application({ id: "c", status: "applied" }),
        application({ id: "d", status: "interview" }),
        application({ id: "e", status: "rejected" }),
      ],
    });

    const summary = await getDashboardSummary(NOW);

    expect(summary.applications.data?.activeCount).toBe(4);
    expect(summary.applications.data?.pipeline).toEqual([
      { status: "applied", count: 2 },
      { status: "interview", count: 1 },
      { status: "offer", count: 1 },
    ]);
  });

  it("counts and flags live applications that have stopped moving", async () => {
    const stale = new Date(NOW - STALE_APPLICATION_MS - 1_000).toISOString();
    stubReads({
      applications: [
        application({ id: "a", job_slug: "stalled", updated_at: stale }),
        application({ id: "b", job_slug: "fresh" }),
        // A closed process is not "stalled" — it is finished.
        application({ id: "c", status: "rejected", updated_at: stale }),
      ],
    });

    const summary = await getDashboardSummary(NOW);

    expect(summary.applications.data?.stalledApplicationCount).toBe(1);
    expect(
      summary.applications.data?.active.map((row) => [
        row.jobSlug,
        row.stalled,
      ]),
    ).toEqual([
      ["stalled", true],
      ["fresh", false],
    ]);
  });
});

describe("profile strength", () => {
  it("names the matching fields still unstated, in the form's order", () => {
    expect(
      missingMatchingFields(
        profileRow({
          headline: null,
          desired_work_arrangement: "unspecified",
          desired_salary_min: null,
        }),
      ),
    ).toEqual([
      "Headline",
      "Preferred work arrangement",
      "Minimum pay expectation",
    ]);
  });

  it("treats an account with no profile as having stated nothing", async () => {
    const summary = await getDashboardSummary(NOW);

    expect(summary.profile.data?.exists).toBe(false);
    expect(summary.profile.data?.completeness).toBe(0);
    expect(summary.profile.data?.missingFields).toHaveLength(
      MATCHING_FIELD_COUNT,
    );
  });

  it("reports a fully stated profile as complete with nothing outstanding", async () => {
    stubReads({ profile: profileRow() });

    const summary = await getDashboardSummary(NOW);

    expect(summary.profile.data?.completeness).toBe(1);
    expect(summary.profile.data?.missingFields).toEqual([]);
  });

  it("counts a declined answer as unstated, since it leaves nothing to match on", async () => {
    stubReads({ profile: profileRow({ experience_level: "unspecified" }) });

    const summary = await getDashboardSummary(NOW);

    expect(summary.profile.data?.missingFields).toEqual(["Experience level"]);
    expect(summary.profile.data?.completeness).toBeCloseTo(
      (MATCHING_FIELD_COUNT - 1) / MATCHING_FIELD_COUNT,
    );
  });
});

describe("summary counts", () => {
  it("counts only running alerts as active", async () => {
    stubReads({
      alerts: [{ active: true }, { active: false }, { active: true }],
    });

    expect((await getDashboardSummary(NOW)).alerts.data?.activeCount).toBe(2);
  });

  it("caps each column at five records while keeping the full count", async () => {
    stubReads({
      saved: Array.from({ length: 7 }, (_, index) =>
        savedJob({ id: `id-${index}`, job_slug: `role-${index}` }),
      ),
    });

    const summary = await getDashboardSummary(NOW);

    expect(summary.savedJobs.data?.count).toBe(7);
    expect(summary.savedJobs.data?.recent).toHaveLength(5);
  });
});
