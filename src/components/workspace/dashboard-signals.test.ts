import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ApplicationRowNote,
  DashboardActionList,
  DashboardDecisionTools,
  DashboardSectionStatus,
  DeadlineList,
  FirstRunGuide,
  PipelineSummary,
} from "./dashboard-signals";
import type { DashboardAction } from "@/lib/career/dashboard-actions";
import type {
  DashboardDeadline,
  DashboardApplications,
} from "@/lib/career/dashboard";

function deadline(
  overrides: Partial<DashboardDeadline> = {},
): DashboardDeadline {
  return {
    jobSlug: "senior-engineer",
    title: "Senior Engineer",
    companyName: "Test Employer",
    dueAt: "2026-07-25T00:00:00.000Z",
    dayOffset: -3,
    urgency: "overdue",
    description: "Overdue by 3 days",
    ...overrides,
  };
}

function activeApplication(
  overrides: Partial<DashboardApplications["active"][number]> = {},
): DashboardApplications["active"][number] {
  return {
    jobSlug: "senior-engineer",
    title: "Senior Engineer",
    companyName: "Test Employer",
    status: "applied",
    updatedAt: "2026-07-27T00:00:00.000Z",
    stalled: false,
    deadline: null,
    ...overrides,
  };
}

describe("scheduled action list", () => {
  it("keeps the date the owner entered beside the phrase derived from it", () => {
    const markup = renderToStaticMarkup(
      createElement(DeadlineList, { deadlines: [deadline()] }),
    );

    expect(markup).toContain("Overdue by 3 days");
    expect(markup).toContain("25 Jul 2026");
    expect(markup).toContain('href="/jobs/senior-engineer"');
  });

  it("escalates colour only for dates that have passed or land immediately", () => {
    const cases: [DashboardDeadline["urgency"], string][] = [
      ["overdue", "status-danger"],
      ["today", "status-warning"],
      ["tomorrow", "status-warning"],
      ["upcoming", "status-neutral"],
    ];
    for (const [urgency, expected] of cases) {
      const markup = renderToStaticMarkup(
        createElement(DeadlineList, { deadlines: [deadline({ urgency })] }),
      );
      expect(markup).toContain(expected);
    }
  });
});

describe("stage breakdown", () => {
  it("renders each stage with its count and marks only an offer as good news", () => {
    const markup = renderToStaticMarkup(
      createElement(PipelineSummary, {
        pipeline: [
          { status: "applied", count: 2 },
          { status: "interview", count: 1 },
          { status: "offer", count: 1 },
        ],
      }),
    );

    expect(markup).toContain("2 Applied");
    expect(markup).toContain("1 Interview");
    expect(markup).toContain("1 Offer");
    expect(markup.match(/status-success/g) ?? []).toHaveLength(1);
  });

  it("labels the breakdown for assistive technology", () => {
    const markup = renderToStaticMarkup(
      createElement(PipelineSummary, {
        pipeline: [{ status: "applied", count: 1 }],
      }),
    );

    expect(markup).toContain('aria-label="Live applications by stage"');
  });
});

describe("application metadata line", () => {
  it("states only what the record's own dates support", () => {
    const markup = renderToStaticMarkup(
      createElement(ApplicationRowNote, { application: activeApplication() }),
    );

    expect(markup).toContain("Test Employer");
    expect(markup).toContain("updated 27 Jul 2026");
    expect(markup).not.toContain("no change");
    expect(markup).not.toContain("Due");
  });

  it("adds the stalled note and the deadline when both apply", () => {
    const markup = renderToStaticMarkup(
      createElement(ApplicationRowNote, {
        application: activeApplication({
          stalled: true,
          deadline: {
            dayOffset: 0,
            urgency: "today",
            description: "Due today",
          },
        }),
      }),
    );

    expect(markup).toContain("no change in over two weeks");
    expect(markup).toContain("Due today");
  });
});

describe("first-run guide", () => {
  it("points at all three setup destinations without JavaScript", () => {
    const markup = renderToStaticMarkup(
      createElement(FirstRunGuide, { profileExists: false }),
    );

    for (const href of ["/jobs", "/account/candidate-profile", "/alerts"]) {
      expect(markup).toContain(`href="${href}"`);
    }
    expect(markup).toContain("Add a career profile");
  });

  it("numbers the steps as an ordered list whose items can still paint a marker", () => {
    const markup = renderToStaticMarkup(
      createElement(FirstRunGuide, { profileExists: false }),
    );

    expect(markup).toContain('<ol class="first-run-steps">');
    // A list item styled as a grid stops computing to `list-item`, and the step
    // numbers vanish. The grid belongs to a wrapper inside the item.
    expect(markup).not.toMatch(/<li[^>]*class="[^"]*\bstack\b/);
    expect(markup.match(/<li><div class="stack">/g) ?? []).toHaveLength(3);
  });

  it("asks an owner with a started profile to finish it rather than add one", () => {
    const markup = renderToStaticMarkup(
      createElement(FirstRunGuide, { profileExists: true }),
    );

    expect(markup).toContain("Finish your career profile");
  });
});

describe("dashboard action list", () => {
  it("keeps the ranked action, reason and destination together", () => {
    const actions: DashboardAction[] = [
      {
        id: "overdue:senior-engineer",
        title: "Update Senior Engineer",
        detail: "Overdue by 3 days. Record where the process stands.",
        href: "/applications",
        linkLabel: "Review tracker",
        tone: "attention",
      },
    ];
    const markup = renderToStaticMarkup(
      createElement(DashboardActionList, { actions }),
    );

    expect(markup).toContain('<ol class="dashboard-action-list">');
    expect(markup).toContain("Now");
    expect(markup).toContain("Overdue by 3 days");
    expect(markup).toContain('href="/applications"');
  });

  it("renders nothing when partial records cannot support a plan", () => {
    expect(
      renderToStaticMarkup(createElement(DashboardActionList, { actions: [] })),
    ).toBe("");
  });

  it("says when ranked actions use only successfully loaded sections", () => {
    const markup = renderToStaticMarkup(
      createElement(DashboardActionList, {
        incomplete: true,
        actions: [
          {
            id: "overdue:senior-engineer",
            title: "Update Senior Engineer",
            detail: "Overdue by 3 days.",
            href: "/applications",
            linkLabel: "Review tracker",
            tone: "attention",
          },
        ],
      }),
    );

    expect(markup).toContain("only the private sections that loaded");
    expect(markup).toContain("do not count as zero");
  });
});

describe("dashboard section status", () => {
  it("does not turn a failed read into a total or empty state", () => {
    const markup = renderToStaticMarkup(
      createElement(DashboardSectionStatus, {
        state: "unavailable",
        title: "Saved jobs",
      }),
    );

    expect(markup).toContain("Saved jobs not shown.");
    expect(markup).toContain("No total or empty state is being inferred");
  });

  it("names partial validation separately from an unavailable backend", () => {
    const markup = renderToStaticMarkup(
      createElement(DashboardSectionStatus, {
        state: "degraded",
        title: "Applications",
      }),
    );

    expect(markup).toContain("Some records could not be verified");
  });
});

describe("dashboard decision tools", () => {
  it("keeps all four local tools in one workflow", () => {
    const markup = renderToStaticMarkup(
      createElement(DashboardDecisionTools, {
        summary: {
          state: "ready",
          savedJobs: {
            state: "ready",
            data: { count: 1, recent: [] },
          },
          applications: {
            state: "ready",
            data: {
              totalCount: 1,
              activeCount: 1,
              upcomingActions: [],
              overdueActionCount: 0,
              stalledApplicationCount: 0,
              pipeline: [{ status: "offer", count: 1 }],
              active: [activeApplication({ status: "offer" })],
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
              attestedAt: "2026-08-01T00:00:00.000Z",
              completeness: 1,
              missingFields: [],
            },
          },
        },
      }),
    );

    for (const path of [
      "/tools/job-scam-checker",
      "/tools/salary-converter",
      "/tools/take-home-pay",
      "/tools/offer-compare",
    ]) {
      expect(markup).toContain(path);
    }
    expect(markup).toContain("from=senior-engineer");
    expect(markup).not.toContain("amount=");
  });
});
