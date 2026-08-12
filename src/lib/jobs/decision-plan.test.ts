import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { JobDecisionReadiness } from "@/components/jobs/job-decision-readiness";
import { JobCard } from "@/components/jobs/job-card";
import { buildJobDecisionPlan } from "@/lib/jobs/decision-plan";
import type { Job } from "@/lib/jobs/types";

const NOW = new Date("2026-08-12T12:00:00.000Z");

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "decision-fixture",
    databaseId: null,
    slug: "decision-fixture",
    externalId: "fixture-1",
    status: "open",
    workMode: "remote",
    arrangement: "employee",
    eligibility: {
      nigeria: "eligible",
      africa: "eligible",
      scope: "africa",
      includedCountries: ["Nigeria"],
      excludedCountries: [],
      requiredTimezone: null,
      workAuthorization: null,
      visaSponsorship: "unclear",
      relocationSupport: "unclear",
      evidenceText:
        "The source explicitly states that applicants in Africa can apply.",
      provenance: "source_provided",
      lastVerifiedAt: "2026-08-11T12:00:00.000Z",
    },
    locationDisplay: "Remote, Africa",
    experienceLevel: "mid",
    employmentType: "full_time",
    title: "Operations Analyst",
    category: "Operations",
    skills: [],
    company: {
      name: "Test Employer",
      slug: "test-employer",
      verification: "source_listed",
    },
    description: "About the role\nBuild useful services.",
    requirements: null,
    benefits: null,
    salary: {
      originalText: "NGN 500,000 monthly",
      currency: "NGN",
      minimum: 500_000,
      maximum: 500_000,
      payPeriod: "monthly",
      grossNet: "gross",
    },
    postedAt: "2026-08-01T12:00:00.000Z",
    lastCheckedAt: "2026-08-12T10:00:00.000Z",
    validThrough: null,
    sourceUrl: "https://apply.workable.com/test-employer/j/ROLE",
    applicationUrl: "https://apply.workable.com/test-employer/j/ROLE",
    source: {
      id: "src",
      name: "Test Employer careers",
      type: "employer",
      termsUrl: "https://example.test/terms",
      termsReviewedAt: "2026-08-01T00:00:00.000Z",
      attributionRequired: "Required",
      canStoreFullDescription: true,
      canIndex: true,
      canUseJobPostingStructuredData: true,
      canEmail: false,
      destinationRequirement: "employer_application_url",
      refreshIntervalSeconds: 21_600,
    },
    riskIndicators: [],
    fingerprint: "fixture",
    ...overrides,
  };
}

describe("job decision plan", () => {
  it("reports no unresolved core check when the source facts cover them", () => {
    const plan = buildJobDecisionPlan(job(), NOW);

    expect(plan.unresolvedCount).toBe(0);
    expect(plan.primary).toBeNull();
    expect(plan.checks.map(({ id, state }) => [id, state])).toEqual([
      ["eligibility", "ready"],
      ["safety", "ready"],
      ["freshness", "ready"],
      ["description", "ready"],
      ["pay", "ready"],
    ]);
  });

  it("prioritises unresolved eligibility ahead of other evidence gaps", () => {
    const sourceOnlyJob = job({
      applicationUrl: "https://linkedin.com/jobs/view/123",
      description:
        "This listing is available as source metadata only. SalaryPadi does not store the provider's full job description; use the application link to review the original posting.",
      eligibility: {
        ...job().eligibility,
        nigeria: "unclear",
        africa: "unclear",
        scope: "unclear",
        evidenceText:
          "The source says remote without naming eligible countries.",
      },
      postedAt: "2026-01-01T12:00:00.000Z",
      salary: null,
      source: { ...job().source, canStoreFullDescription: false },
    });
    const plan = buildJobDecisionPlan(sourceOnlyJob, NOW);

    expect(plan.unresolvedCount).toBe(4);
    expect(plan.primary?.id).toBe("eligibility");
    expect(plan.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "safety", state: "check" }),
        expect.objectContaining({ id: "freshness", state: "check" }),
        expect.objectContaining({ id: "description", state: "check" }),
        expect.objectContaining({ id: "pay", state: "optional" }),
      ]),
    );
  });

  it("uses recorded risk evidence instead of inventing a generic warning", () => {
    const plan = buildJobDecisionPlan(
      job({
        riskIndicators: [
          {
            code: "application_fee",
            label: "Application fee mentioned",
            explanation: "The source wording asks applicants for a fee.",
            severity: "high",
          },
        ],
      }),
      NOW,
    );

    expect(plan.checks[1]).toMatchObject({
      id: "safety",
      state: "check",
      label: "Application fee mentioned",
      action: "scam_check",
    });
  });

  it("respects a reviewed employer-source destination contract", () => {
    const plan = buildJobDecisionPlan(
      job({
        applicationUrl: "https://careers.example.org/open-role",
      }),
      NOW,
    );

    expect(plan.checks[1]).toMatchObject({
      id: "safety",
      state: "ready",
      label: "Application path is employer-controlled",
    });
  });

  it("renders the same prioritised rule in quick view and the full ledger", () => {
    const unclear = job({
      eligibility: {
        ...job().eligibility,
        nigeria: "unclear",
        africa: "unclear",
        scope: "unclear",
      },
    });
    const compact = renderToStaticMarkup(
      createElement(JobDecisionReadiness, { job: unclear, variant: "compact" }),
    );
    const full = renderToStaticMarkup(
      createElement(JobDecisionReadiness, { job: unclear }),
    );

    expect(compact).toContain("Best next check");
    expect(compact).toContain("Country eligibility needs confirmation");
    expect(compact).toContain("Check source");
    expect(full).toContain("1 check deserves attention");
    expect(full).toContain("This is not a fit score");
  });

  it("surfaces the unresolved count on shared job cards", () => {
    const unclear = job({
      eligibility: {
        ...job().eligibility,
        nigeria: "unclear",
        africa: "unclear",
        scope: "unclear",
      },
    });
    const html = renderToStaticMarkup(createElement(JobCard, { job: unclear }));

    expect(html).toContain("1 check before applying");
  });
});
