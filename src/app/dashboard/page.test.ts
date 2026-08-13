import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/dal", () => ({ requireViewer: vi.fn() }));
vi.mock("@/lib/career/cv/repository", () => ({
  getCurrentCandidateCv: vi.fn(),
}));
vi.mock("@/lib/career/notification-sync", () => ({
  syncNotifications: vi.fn(),
}));
vi.mock("@/lib/career/notifications", () => ({
  readUnreadNotificationCount: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/career/dashboard", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/career/dashboard")>();
  return { ...actual, getDashboardSummary: vi.fn() };
});

import DashboardPage from "./page";
import {
  getDashboardSummary,
  type DashboardSummary,
} from "@/lib/career/dashboard";
import { requireViewer } from "@/lib/auth/dal";
import {
  getCurrentCandidateCv,
  type CandidateCvRow,
} from "@/lib/career/cv/repository";
import {
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
} from "@/lib/data/repository-result";

/** A summary with something in every section, unless a test empties one. */
function summary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    state: "ready",
    savedJobs: {
      state: "ready",
      data: {
        count: 12,
        recent: [
          {
            jobSlug: "product-designer",
            title: "Product Designer",
            companyName: "Test Employer",
            savedAt: "2026-07-26T00:00:00.000Z",
          },
        ],
      },
    },
    applications: {
      state: "ready",
      data: {
        totalCount: 2,
        activeCount: 2,
        upcomingActions: [
          {
            jobSlug: "senior-engineer",
            title: "Senior Engineer",
            companyName: "Test Employer",
            dueAt: "2026-07-25T00:00:00.000Z",
            dayOffset: -3,
            urgency: "overdue",
            description: "Overdue by 3 days",
          },
        ],
        overdueActionCount: 1,
        stalledApplicationCount: 1,
        pipeline: [
          { status: "applied", count: 1 },
          { status: "interview", count: 1 },
        ],
        active: [
          {
            jobSlug: "senior-engineer",
            title: "Senior Engineer",
            companyName: "Test Employer",
            status: "interview",
            updatedAt: "2026-07-05T00:00:00.000Z",
            stalled: true,
            deadline: {
              dayOffset: -3,
              urgency: "overdue",
              description: "Overdue by 3 days",
            },
          },
        ],
      },
    },
    alerts: {
      state: "ready",
      data: { totalCount: 1, activeCount: 1 },
    },
    isFirstRun: false,
    profile: {
      state: "ready",
      data: {
        exists: true,
        headline: "Backend engineer",
        attestedAt: "2026-07-20T00:00:00.000Z",
        completeness: 0.6,
        missingFields: ["Country you live in", "Minimum pay expectation"],
      },
    },
    ...overrides,
  };
}

/** Server components resolve before render; there are no hooks to drive here. */
async function render(value: DashboardSummary) {
  vi.mocked(getDashboardSummary).mockResolvedValue(value);
  return renderToStaticMarkup(await DashboardPage());
}

const emptyAccount: Partial<DashboardSummary> = {
  savedJobs: {
    state: "ready",
    data: { count: 0, recent: [] },
  },
  applications: {
    state: "ready",
    data: {
      totalCount: 0,
      activeCount: 0,
      upcomingActions: [],
      overdueActionCount: 0,
      stalledApplicationCount: 0,
      pipeline: [],
      active: [],
    },
  },
  alerts: {
    state: "ready",
    data: { totalCount: 0, activeCount: 0 },
  },
  profile: {
    state: "ready",
    data: {
      exists: false,
      headline: null,
      attestedAt: null,
      completeness: 0,
      missingFields: [
        "Headline",
        "Experience level",
        "Preferred work arrangement",
        "Country you live in",
        "Minimum pay expectation",
      ],
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentCandidateCv).mockResolvedValue(repositoryReady(null));
});

describe("dashboard overview", () => {
  it("gates itself on a signed-in viewer before reading anything", async () => {
    await render(summary());

    expect(vi.mocked(requireViewer)).toHaveBeenCalledWith("/dashboard");
  });

  it("shows the counts, the stage breakdown and what is due", async () => {
    const markup = await render(summary());

    expect(markup).toContain("3 of 5 fields that improve your matches");
    expect(markup).toContain("60%");
    expect(markup).toContain("What is due");
    expect(markup).toContain("Overdue by 3 days");
    expect(markup).toContain("One action is past its date.");
    expect(markup).toContain("1 Applied");
    expect(markup).toContain("no change in over two weeks");
    expect(markup).toContain("Move one decision forward");
    expect(markup).toContain("Review tracker");
    expect(markup).toContain("Decision tools");
  });

  it("names the profile fields still unstated rather than only a percentage", async () => {
    const markup = await render(summary());

    expect(markup).toContain("Still to state (2):");
    expect(markup).toContain("Country you live in");
    expect(markup).toContain("Minimum pay expectation");
  });

  it("drops the profile prompt once every matching field is stated", async () => {
    const markup = await render(
      summary({
        profile: {
          state: "ready",
          data: {
            exists: true,
            headline: "Backend engineer",
            attestedAt: "2026-07-20T00:00:00.000Z",
            completeness: 1,
            missingFields: [],
          },
        },
      }),
    );

    expect(markup).not.toContain("Strengthen your profile");
  });

  it("omits the due section entirely when no date is set", async () => {
    const value = summary();
    if (value.applications.state !== "ready") {
      throw new Error("test fixture must have ready applications");
    }
    value.applications.data.upcomingActions = [];
    value.applications.data.overdueActionCount = 0;
    const markup = await render(value);

    expect(markup).not.toContain("What is due");
  });

  it("replaces the zeroed summary with setup steps on a fresh account", async () => {
    const markup = await render(summary({ ...emptyAccount, isFirstRun: true }));

    expect(markup).toContain("Set up your workspace");
    expect(markup).toContain("Browse roles open to Nigeria");
    // The stat grid and the two empty columns would say nothing here.
    expect(markup).not.toContain("workspace-stats");
    expect(markup).not.toContain("workspace-columns");
    expect(markup).toContain("Decision tools");
  });

  it("does not call an account with a stored CV a first run", async () => {
    const storedCv: CandidateCvRow = {
      id: "2fa5ec4f-bac3-4fcf-980d-7c8832498454",
      storage_path: "candidate/example.pdf",
      file_name: "example.pdf",
      content_type: "application/pdf",
      byte_size: 1_024,
      extracted_text: "Skills: SQL, TypeScript",
      parse_state: "parsed",
      parse_note: null,
      is_current: true,
      uploaded_at: "2026-08-01T00:00:00.000Z",
    };
    vi.mocked(getCurrentCandidateCv).mockResolvedValue(
      repositoryReady(storedCv),
    );

    const markup = await render(summary({ ...emptyAccount, isFirstRun: true }));

    expect(markup).not.toContain("Set up your workspace");
    expect(markup).toContain("workspace-stats");
    expect(markup).toContain("Nothing in flight yet.");
    expect(markup).toContain("No saved jobs yet.");
    expect(markup).toContain("You have not created a career profile yet.");
  });

  it("renders failed applications and profile reads as unavailable, not empty", async () => {
    const markup = await render(
      summary({
        state: "unavailable",
        applications: { state: "unavailable", data: null },
        profile: { state: "unavailable", data: null },
      }),
    );

    expect(markup).toContain("Applications not shown.");
    expect(markup).toContain("Profile details not shown.");
    expect(markup).not.toContain("Nothing in flight yet.");
    expect(markup).not.toContain("You have not created a career profile yet.");
    expect(markup).toContain("Private applications could not be loaded");
    expect(markup).toContain("Private profile data could not be loaded");
  });

  it("names a degraded saved-job read without claiming there are none", async () => {
    const markup = await render(
      summary({
        state: "degraded",
        savedJobs: { state: "degraded", data: null },
      }),
    );

    expect(markup).toContain("Saved jobs not shown.");
    expect(markup).toContain("Some records could not be verified");
    expect(markup).not.toContain("No saved jobs yet.");
    expect(markup).toContain(
      "Some saved jobs could not be verified; no total is shown",
    );
  });

  it("renders a failed CV read as unavailable rather than zero skills or no CV", async () => {
    vi.mocked(getCurrentCandidateCv).mockResolvedValue(
      repositoryFailure(
        "unavailable",
        null,
        repositoryIssue("get_my_cvs", "query_failed", "career_rpc_error"),
      ),
    );

    const markup = await render(summary());

    expect(markup).toContain("Private CV records could not be loaded");
    expect(markup).not.toContain("No CV stored yet");
    expect(markup).not.toContain("No named skills were read from this CV");
  });

  it("never shows setup steps when a read failed, even with nothing to show", async () => {
    // A failed read reports zero of everything. Greeting that as a fresh
    // account would present missing data as an empty one.
    for (const state of ["unconfigured", "unavailable", "invalid"] as const) {
      const markup = await render(
        summary({
          ...emptyAccount,
          state,
          savedJobs: { state, data: null },
          isFirstRun: false,
        }),
      );

      expect(markup).toContain("Private data could not be loaded.");
      expect(markup).not.toContain("Set up your workspace");
      expect(markup).toContain("Saved jobs not shown.");
      expect(markup).not.toContain("No saved jobs yet.");
    }
  });

  it("keeps the dashboard out of search indexes", async () => {
    const { metadata } = await import("./page");

    expect(metadata.robots).toEqual({
      index: false,
      follow: false,
      nocache: true,
    });
  });
});
