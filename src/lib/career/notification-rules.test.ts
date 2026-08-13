import { describe, expect, it } from "vitest";

import type { DashboardApplications, DashboardSummary } from "./dashboard";
import { deriveNotifications } from "./notification-rules";

function applications(
  overrides: Partial<DashboardApplications> = {},
): DashboardSummary["applications"] {
  return {
    state: "ready",
    data: {
      totalCount: 0,
      activeCount: 0,
      upcomingActions: [],
      overdueActionCount: 0,
      stalledApplicationCount: 0,
      pipeline: [],
      active: [],
      ...overrides,
    },
  };
}

function summary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    state: "ready",
    savedJobs: {
      state: "ready",
      data: { count: 0, recent: [] },
    },
    applications: applications(),
    alerts: {
      state: "ready",
      data: { totalCount: 0, activeCount: 0 },
    },
    isFirstRun: false,
    profile: {
      state: "ready",
      data: {
        exists: false,
        headline: null,
        attestedAt: null,
        completeness: 0,
        missingFields: [],
      },
    },
    ...overrides,
  };
}

describe("deriving notifications from a viewer's own records", () => {
  it("records nothing at all when the underlying reads did not succeed", () => {
    // A missing record is not an absent obligation. Notifying from a degraded
    // read would tell someone nothing is due when the truth is unknown.
    expect(
      deriveNotifications(
        summary({
          state: "degraded",
          applications: { state: "degraded", data: null },
        }),
      ),
    ).toEqual([]);
  });

  it("names an overdue action and points at the record that carries it", () => {
    const derived = deriveNotifications(
      summary({
        applications: applications({
          upcomingActions: [
            {
              urgency: "overdue",
              jobSlug: "backend-engineer",
              title: "Backend Engineer",
              companyName: "Acme",
              dueAt: "2026-07-20T00:00:00.000Z",
              dayOffset: -8,
              description: "Overdue by 8 days",
            },
          ],
        }),
      }),
    );

    expect(derived).toHaveLength(1);
    expect(derived[0]?.kind).toBe("action_due");
    expect(derived[0]?.title).toContain("Backend Engineer");
    expect(derived[0]?.href).toBe("/applications");
    // Pinned to the date, so leaving the date alone does not re-notify and
    // moving it on produces a genuinely new one.
    expect(derived[0]?.dedupeKey).toBe(
      "action_due:backend-engineer:2026-07-20",
    );
  });

  it("only reports a stalled application when the record says it stalled", () => {
    const stalled = {
      jobSlug: "data-analyst",
      title: "Data Analyst",
      companyName: "Kuda",
      status: "applied",
      updatedAt: "2026-07-01T00:00:00.000Z",
      stalled: true,
      deadline: null,
    };
    const moving = { ...stalled, jobSlug: "other", stalled: false };

    const derived = deriveNotifications(
      summary({ applications: applications({ active: [stalled, moving] }) }),
    );

    expect(derived).toHaveLength(1);
    expect(derived[0]?.kind).toBe("application_stalled");
    expect(derived[0]?.dedupeKey).toContain("data-analyst");
  });

  it("keeps every link inside the site", () => {
    const derived = deriveNotifications(
      summary({
        applications: applications({
          active: [
            {
              jobSlug: "data-analyst",
              title: "Data Analyst",
              companyName: "Kuda",
              status: "applied",
              updatedAt: "2026-07-01T00:00:00.000Z",
              stalled: true,
              deadline: null,
            },
          ],
        }),
      }),
    );

    for (const notification of derived) {
      expect(notification.href.startsWith("/")).toBe(true);
      expect(notification.href).not.toContain("//");
    }
  });

  it("produces nothing when there is nothing to say", () => {
    expect(deriveNotifications(summary())).toEqual([]);
  });
});
