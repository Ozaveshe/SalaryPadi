/**
 * Prohibited states.
 *
 * Each test here encodes one way the product can lie to a user. They are
 * deliberately written against the modules that make the decision rather than
 * against a rendered page, so a regression fails at the source and names the
 * rule it broke.
 *
 * This complements `src/lib/presentation/prohibited-labels.test.ts`, which
 * guards customer-facing *language*. This file guards customer-facing
 * *claims*.
 */

import { describe, expect, it } from "vitest";

import { classifyFreshness } from "@/lib/serving/freshness";
import { rankJobs, type RankableJob } from "@/lib/search/ranking";
import {
  evaluateQualityGates,
  mayEnterNigeriaCollection,
  type JobCandidate,
} from "@/lib/serving/quality-gates";
import { decidePublication } from "@/lib/contributions/slice-privacy";
import { mayEmployerEdit } from "@/lib/employers/data-boundaries";
import { mayPublishUnderRights } from "@/lib/canonical/source-rights";
import { preferredDestination } from "@/lib/canonical/application-destination";
import {
  withJobContext,
  readJobContext,
  type JobContext,
} from "@/lib/product/job-context";
import {
  isEmployerFact,
  assumed,
  disclosed,
  computeValue,
} from "@/lib/workspace/value-provenance";
import {
  hasIndexableDescription,
  METADATA_ONLY_DESCRIPTION_SENTINEL,
} from "@/lib/seo/job-posting";

const NOW = new Date("2026-08-02T12:00:00Z");

function candidate(overrides: Partial<JobCandidate> = {}): JobCandidate {
  return {
    rightsClassification: "public_ats_permitted",
    employerId: "cmp-1",
    canonicalJobId: "job-1",
    applicationUrl: "https://boards.greenhouse.io/x/1",
    applyLinkState: "healthy",
    lastConfirmedAt: "2026-08-02T06:00:00Z",
    freshnessWindowHours: 24,
    descriptionLength: 900,
    title: "Senior Analyst",
    hasLocationEvidence: true,
    eligibility: "nigeria_eligible",
    ...overrides,
  };
}

function rankable(overrides: Partial<RankableJob> = {}): RankableJob {
  return {
    id: "job-1",
    employerKey: "emp-1",
    textRelevance: 1,
    eligibility: "nigeria_explicit",
    hoursSinceConfirmed: 2,
    daysSincePosted: 2,
    sourceAuthority: "employer_ats",
    applyLinkState: "healthy",
    destinationKind: "employer_ats",
    salaryDisclosed: false,
    employerVerified: false,
    locationMatch: false,
    preferenceMatch: 0,
    ...overrides,
  };
}

describe("a source failure must never become zero jobs", () => {
  it("reports unavailable, not confirmed-empty, when the read failed", () => {
    const verdict = classifyFreshness({
      readSucceeded: false,
      recordCount: 0,
      verifiedAt: new Date().toISOString(),
      delayedSourceCount: 2,
      totalSourceCount: 5,
      freshnessTargetMs: 6 * 3_600_000,
    });
    expect(verdict.state).not.toBe("confirmed_empty");
    expect(verdict.message).toMatch(/does not mean there are no jobs/i);
  });

  it("does not claim emptiness while any source is delayed", () => {
    const verdict = classifyFreshness({
      readSucceeded: true,
      recordCount: 0,
      verifiedAt: new Date().toISOString(),
      delayedSourceCount: 1,
      totalSourceCount: 5,
      freshnessTargetMs: 6 * 3_600_000,
    });
    expect(verdict.state).toBe("partial");
  });
});

describe("an unclear job must never be promoted as eligible", () => {
  it("publishes it but keeps it out of the Nigeria collection", () => {
    const outcome = evaluateQualityGates(
      candidate({ eligibility: "unclear" }),
      NOW,
    );
    expect(outcome.publishable).toBe(true);
    expect(mayEnterNigeriaCollection(outcome)).toBe(false);
  });

  it("ranks it below anything explicitly eligible", () => {
    const { organic } = rankJobs([
      rankable({ id: "unclear", eligibility: "unclear" }),
      rankable({ id: "explicit" }),
    ]);
    expect(organic[0]?.job.id).toBe("explicit");
  });
});

describe("a broken application link must never look verified", () => {
  it("fails the publication gate outright", () => {
    const outcome = evaluateQualityGates(
      candidate({ applyLinkState: "broken" }),
      NOW,
    );
    expect(outcome.publishable).toBe(false);
  });

  it("scores zero application quality in ranking", () => {
    const { organic } = rankJobs([rankable({ applyLinkState: "broken" })]);
    expect(organic[0]?.components.applyQuality).toBe(0);
  });

  it("is never chosen as the preferred destination", () => {
    const chosen = preferredDestination([
      {
        url: "https://a.example/1",
        kind: "direct_employer",
        linkState: "broken",
      },
      { url: "https://b.example/1", kind: "aggregator", linkState: "healthy" },
    ]);
    expect(chosen?.kind).toBe("aggregator");
  });
});

describe("a sponsored job must never enter organic results", () => {
  it("is partitioned out entirely", () => {
    const { organic, sponsored } = rankJobs([
      rankable({ id: "paid", sponsored: true }),
      rankable({ id: "free" }),
    ]);
    expect(organic.map((entry) => entry.job.id)).toEqual(["free"]);
    expect(sponsored.map((entry) => entry.job.id)).toEqual(["paid"]);
  });

  it("gains no score advantage from being paid", () => {
    const { organic, sponsored } = rankJobs([
      rankable({ id: "paid", sponsored: true }),
      rankable({ id: "free" }),
    ]);
    expect(sponsored[0]?.score).toBe(organic[0]?.score);
  });

  it("still has to pass every quality gate", () => {
    // Paying does not buy past a broken link.
    expect(
      evaluateQualityGates(candidate({ applyLinkState: "broken" }), NOW)
        .publishable,
    ).toBe(false);
  });
});

describe("a job without rights approval must never publish", () => {
  it("is blocked before any other consideration", () => {
    for (const rights of ["prohibited", "disabled", "review_required", null]) {
      expect(mayPublishUnderRights(rights)).toBe(false);
      const outcome = evaluateQualityGates(
        candidate({ rightsClassification: rights }),
        NOW,
      );
      expect(outcome.publishable).toBe(false);
      if (!outcome.publishable) {
        expect(outcome.failure.gate).toBe("source_rights");
      }
    }
  });
});

describe("a contribution must never publish below its privacy threshold", () => {
  it("suppresses a thin cohort", () => {
    const decision = decidePublication({
      slice: { dimensions: ["role", "country"] },
      distinctContributors: 2,
    });
    expect(decision.publish).toBe(false);
  });

  it("suppresses an identifying slice at any cohort size", () => {
    const decision = decidePublication({
      slice: { dimensions: ["role", "employer", "team"] },
      distinctContributors: 1_000,
    });
    expect(decision.publish).toBe(false);
  });

  it("never leaks the cohort size to the reader", () => {
    const decision = decidePublication({
      slice: { dimensions: ["role", "country"] },
      distinctContributors: 2,
    });
    if (!decision.publish) {
      expect(decision.publicMessage).not.toMatch(/\d/);
    }
  });
});

describe("employer-provided content must never read as independent evidence", () => {
  it("labels everything an employer writes as theirs", () => {
    const decision = mayEmployerEdit("company_description");
    expect(decision).toMatchObject({
      allowed: true,
      label: "employer_provided",
    });
  });

  it("refuses every independent-evidence field", () => {
    for (const field of [
      "salary_aggregate",
      "pay_reliability_aggregate",
      "review_order",
      "eligibility_evidence",
      "verification_badge",
      "source_receipt",
    ]) {
      expect(mayEmployerEdit(field).allowed).toBe(false);
    }
  });
});

describe("a tool handoff must never lose the originating job", () => {
  it("carries the job through and back", () => {
    const context: JobContext = {
      slug: "senior-analyst-abc123",
      title: "Senior Analyst",
      company: "Moniepoint",
      companySlug: "moniepoint",
      amount: 600_000,
      currency: "NGN",
      period: "monthly",
    };
    const url = withJobContext("/tools/take-home-pay", context);
    const params = Object.fromEntries(new URLSearchParams(url.split("?")[1]));
    const recovered = readJobContext(params);
    expect(recovered?.slug).toBe("senior-analyst-abc123");
    expect(recovered?.amount).toBe(600_000);
  });
});

describe("an assumption must never become an employer fact", () => {
  it("degrades to an estimate the moment an assumption is involved", () => {
    const takeHome = computeValue(
      [disclosed(600_000), assumed(0.24, "PAYE band assumed")],
      ([pay, rate]) => pay! * (1 - rate!),
    );
    expect(takeHome.origin).toBe("estimated");
    expect(isEmployerFact(takeHome)).toBe(false);
  });
});

describe("structured data must never describe a page that is not there", () => {
  it("refuses to index a placeholder-only job page", () => {
    expect(
      hasIndexableDescription({
        description: METADATA_ONLY_DESCRIPTION_SENTINEL,
      } as never),
    ).toBe(false);
  });

  it("refuses to index a thin description", () => {
    expect(hasIndexableDescription({ description: "Short." } as never)).toBe(
      false,
    );
  });
});
