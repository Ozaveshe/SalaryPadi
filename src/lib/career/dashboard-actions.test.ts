import { describe, expect, it } from "vitest";

import { getDashboardActions } from "@/lib/career/dashboard-actions";
import type {
  DashboardApplications,
  DashboardProfile,
  DashboardSummary,
} from "@/lib/career/dashboard";

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

function profile(
  overrides: Partial<DashboardProfile> = {},
): DashboardSummary["profile"] {
  return {
    state: "ready",
    data: {
      exists: true,
      headline: "Backend engineer",
      attestedAt: "2026-08-01T00:00:00.000Z",
      completeness: 1,
      missingFields: [],
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
      data: { totalCount: 1, activeCount: 1 },
    },
    isFirstRun: false,
    profile: profile(),
    ...overrides,
  };
}

describe("dashboard actions", () => {
  it("puts a self-set overdue action first", () => {
    const actions = getDashboardActions(
      summary({
        applications: applications({
          upcomingActions: [
            {
              jobSlug: "product-lead",
              title: "Product Lead",
              companyName: "Example Employer",
              dueAt: "2026-08-10T00:00:00.000Z",
              dayOffset: -3,
              urgency: "overdue",
              description: "Overdue by 3 days",
            },
          ],
        }),
      }),
    );

    expect(actions[0]).toMatchObject({
      id: "overdue:product-lead",
      href: "/applications",
      linkLabel: "Review tracker",
      tone: "attention",
    });
    expect(actions[0]?.detail).toContain("Overdue by 3 days");
  });

  it("carries an offer into comparison without inventing offer pay", () => {
    const actions = getDashboardActions(
      summary({
        applications: applications({
          active: [
            {
              jobSlug: "product-lead",
              title: "Product Lead",
              companyName: "Example Employer",
              status: "offer",
              updatedAt: "2026-08-12T00:00:00.000Z",
              stalled: false,
              deadline: null,
            },
          ],
        }),
      }),
    );

    const offer = actions.find((action) => action.id === "offer:product-lead");
    expect(offer?.href).toContain("/tools/offer-compare?from=product-lead");
    expect(offer?.href).toContain("role=Product+Lead");
    expect(offer?.href).not.toContain("amount=");
    expect(offer?.detail).toContain("offer itself");
  });

  it("uses only profile and alert facts for setup actions", () => {
    const actions = getDashboardActions(
      summary({
        alerts: {
          state: "ready",
          data: { totalCount: 0, activeCount: 0 },
        },
        profile: profile({
          exists: true,
          headline: "Backend engineer",
          attestedAt: "2026-08-01T00:00:00.000Z",
          completeness: 0.6,
          missingFields: ["Country you live in", "Minimum pay expectation"],
        }),
      }),
    );

    expect(actions.map((action) => action.id)).toEqual(["profile", "alert"]);
    expect(actions[0]?.detail).toContain("2 fields are still unstated");
  });

  it("does not invent an action from an unavailable section", () => {
    expect(
      getDashboardActions(
        summary({
          state: "degraded",
          alerts: { state: "degraded", data: null },
        }),
      ),
    ).toEqual([]);
  });

  it("keeps a supported action when an unrelated section is unavailable", () => {
    const actions = getDashboardActions(
      summary({
        state: "unavailable",
        alerts: { state: "unavailable", data: null },
        applications: applications({
          upcomingActions: [
            {
              jobSlug: "product-lead",
              title: "Product Lead",
              companyName: "Example Employer",
              dueAt: "2026-08-10T00:00:00.000Z",
              dayOffset: -3,
              urgency: "overdue",
              description: "Overdue by 3 days",
            },
          ],
        }),
      }),
    );

    expect(actions[0]?.id).toBe("overdue:product-lead");
  });

  it("asks a moving application without a date for one concrete next step", () => {
    const actions = getDashboardActions(
      summary({
        applications: applications({
          activeCount: 1,
          active: [
            {
              jobSlug: "product-lead",
              title: "Product Lead",
              companyName: "Example Employer",
              status: "applied",
              updatedAt: "2026-08-12T00:00:00.000Z",
              stalled: false,
              deadline: null,
            },
          ],
        }),
      }),
    );

    expect(actions[0]).toMatchObject({
      id: "schedule:product-lead",
      href: "/applications",
      linkLabel: "Plan next action",
    });
  });

  it("offers discovery only when nothing else needs attention", () => {
    expect(getDashboardActions(summary())).toEqual([
      expect.objectContaining({ id: "discover", href: "/jobs" }),
    ]);
  });
});
