import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/dal", () => ({ requireViewer: vi.fn() }));
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

/** A summary with something in every section, unless a test empties one. */
function summary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    state: "ready",
    savedJobCount: 12,
    activeApplicationCount: 2,
    activeAlertCount: 1,
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
    isFirstRun: false,
    recentSaved: [
      {
        jobSlug: "product-designer",
        title: "Product Designer",
        companyName: "Test Employer",
        savedAt: "2026-07-26T00:00:00.000Z",
      },
    ],
    activeApplications: [
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
    profile: {
      exists: true,
      headline: "Backend engineer",
      attestedAt: "2026-07-20T00:00:00.000Z",
      completeness: 0.6,
      missingFields: ["Country you live in", "Minimum pay expectation"],
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
  savedJobCount: 0,
  activeApplicationCount: 0,
  activeAlertCount: 0,
  upcomingActions: [],
  overdueActionCount: 0,
  stalledApplicationCount: 0,
  pipeline: [],
  recentSaved: [],
  activeApplications: [],
};

beforeEach(() => {
  vi.clearAllMocks();
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
          exists: true,
          headline: "Backend engineer",
          attestedAt: "2026-07-20T00:00:00.000Z",
          completeness: 1,
          missingFields: [],
        },
      }),
    );

    expect(markup).not.toContain("Strengthen your profile");
  });

  it("omits the due section entirely when no date is set", async () => {
    const markup = await render(
      summary({ upcomingActions: [], overdueActionCount: 0 }),
    );

    expect(markup).not.toContain("What is due");
  });

  it("replaces the zeroed summary with setup steps on a fresh account", async () => {
    const markup = await render(summary({ ...emptyAccount, isFirstRun: true }));

    expect(markup).toContain("Set up your workspace");
    expect(markup).toContain("Browse roles open to Nigeria");
    // The stat grid and the two empty columns would say nothing here.
    expect(markup).not.toContain("workspace-stats");
    expect(markup).not.toContain("workspace-columns");
  });

  it("never shows setup steps when a read failed, even with nothing to show", async () => {
    // A failed read reports zero of everything. Greeting that as a fresh
    // account would present missing data as an empty one.
    for (const state of ["unconfigured", "unavailable", "invalid"] as const) {
      const markup = await render(
        summary({ ...emptyAccount, state, isFirstRun: false }),
      );

      expect(markup).toContain("Private data could not be loaded.");
      expect(markup).not.toContain("Set up your workspace");
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
