import { describe, expect, it } from "vitest";

import {
  evaluateQualityGates,
  mayEnterNigeriaCollection,
  summariseGateOutcomes,
  type JobCandidate,
} from "./quality-gates";

const NOW = new Date("2026-08-02T12:00:00Z");

function candidate(overrides: Partial<JobCandidate> = {}): JobCandidate {
  return {
    rightsClassification: "public_ats_permitted",
    employerId: "cmp-moniepoint",
    canonicalJobId: "job-1",
    applicationUrl: "https://boards.greenhouse.io/moniepoint/jobs/1",
    applyLinkState: "healthy",
    lastConfirmedAt: "2026-08-02T06:00:00Z",
    freshnessWindowHours: 24,
    descriptionLength: 900,
    title: "Senior Backend Engineer",
    hasLocationEvidence: true,
    eligibility: "nigeria_eligible",
    ...overrides,
  };
}

describe("quality gates", () => {
  it("publishes a job that passes every gate", () => {
    const outcome = evaluateQualityGates(candidate(), NOW);
    expect(outcome.publishable).toBe(true);
  });

  it("blocks a job whose source rights do not permit publication", () => {
    for (const rights of ["prohibited", "disabled", "review_required", null]) {
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

  it("checks rights before anything else", () => {
    // A rights-blocked job that is also broken and stale still reports rights.
    const outcome = evaluateQualityGates(
      candidate({
        rightsClassification: "prohibited",
        applicationUrl: null,
        lastConfirmedAt: null,
      }),
      NOW,
    );
    expect(outcome.publishable).toBe(false);
    if (!outcome.publishable) {
      expect(outcome.failure.gate).toBe("source_rights");
    }
  });

  it("blocks a job with a broken application destination", () => {
    const outcome = evaluateQualityGates(
      candidate({ applyLinkState: "broken" }),
      NOW,
    );
    expect(outcome.publishable).toBe(false);
    if (!outcome.publishable) {
      expect(outcome.failure.gate).toBe("application_destination");
    }
  });

  it("blocks a job never confirmed by a complete snapshot", () => {
    const outcome = evaluateQualityGates(
      candidate({ lastConfirmedAt: null }),
      NOW,
    );
    if (!outcome.publishable) expect(outcome.failure.gate).toBe("freshness");
  });

  it("applies each source's own freshness window", () => {
    // 30 hours old: inside a weekly window, outside a daily one.
    const thirtyHoursAgo = "2026-08-01T06:00:00Z";
    expect(
      evaluateQualityGates(
        candidate({
          lastConfirmedAt: thirtyHoursAgo,
          freshnessWindowHours: 168,
        }),
        NOW,
      ).publishable,
    ).toBe(true);
    expect(
      evaluateQualityGates(
        candidate({
          lastConfirmedAt: thirtyHoursAgo,
          freshnessWindowHours: 24,
        }),
        NOW,
      ).publishable,
    ).toBe(false);
  });

  it("blocks a job too thin to be worth a page", () => {
    const outcome = evaluateQualityGates(
      candidate({ descriptionLength: 40 }),
      NOW,
    );
    if (!outcome.publishable) {
      expect(outcome.failure.gate).toBe("minimum_content");
    }
  });

  it("publishes a job with no salary — pay is not a quality gate", () => {
    // Most Nigerian postings do not disclose pay; requiring it would empty
    // the board and teach employers nothing.
    expect(evaluateQualityGates(candidate(), NOW).publishable).toBe(true);
  });

  it("blocks a job with no location evidence", () => {
    const outcome = evaluateQualityGates(
      candidate({ hasLocationEvidence: false }),
      NOW,
    );
    if (!outcome.publishable) {
      expect(outcome.failure.gate).toBe("location_representation");
    }
  });

  it("blocks a duplicate that is already represented canonically", () => {
    const outcome = evaluateQualityGates(
      candidate({ duplicateOfJobId: "job-original" }),
      NOW,
    );
    if (!outcome.publishable) {
      expect(outcome.failure.gate).toBe("non_duplication");
    }
  });

  it("holds a job raised by safety screening", () => {
    const outcome = evaluateQualityGates(
      candidate({ safetyFlags: ["requests_payment"] }),
      NOW,
    );
    if (!outcome.publishable) {
      expect(outcome.failure.gate).toBe("safety");
    }
  });
});

describe("eligibility representation", () => {
  it("publishes an unclear-eligibility job rather than hiding real work", () => {
    const outcome = evaluateQualityGates(
      candidate({ eligibility: "unclear" }),
      NOW,
    );
    expect(outcome.publishable).toBe(true);
    if (outcome.publishable) {
      expect(outcome.eligibilityCollection).toBe("unclear_only");
    }
  });

  it("never promotes an unclear job into the Nigeria-eligible collection", () => {
    // Appearing there is itself a claim that the person can apply.
    const outcome = evaluateQualityGates(
      candidate({ eligibility: "unclear" }),
      NOW,
    );
    expect(mayEnterNigeriaCollection(outcome)).toBe(false);
  });

  it("promotes only an explicitly Nigeria-eligible job", () => {
    expect(
      mayEnterNigeriaCollection(evaluateQualityGates(candidate(), NOW)),
    ).toBe(true);
    for (const eligibility of ["africa_eligible", "global_remote"] as const) {
      expect(
        mayEnterNigeriaCollection(
          evaluateQualityGates(candidate({ eligibility }), NOW),
        ),
      ).toBe(false);
    }
  });

  it("withholds a job that explicitly excludes Nigeria", () => {
    const outcome = evaluateQualityGates(
      candidate({ eligibility: "excluded" }),
      NOW,
    );
    expect(outcome.publishable).toBe(false);
  });

  it("withholds a job with no eligibility evidence at all", () => {
    const outcome = evaluateQualityGates(
      candidate({ eligibility: "not_stated" }),
      NOW,
    );
    if (!outcome.publishable) {
      expect(outcome.failure.gate).toBe("eligibility_representation");
    }
  });
});

describe("gate reporting", () => {
  it("shows an operator where jobs are dying", () => {
    const report = summariseGateOutcomes([
      evaluateQualityGates(candidate(), NOW),
      evaluateQualityGates(
        candidate({ rightsClassification: "disabled" }),
        NOW,
      ),
      evaluateQualityGates(candidate({ applyLinkState: "broken" }), NOW),
      evaluateQualityGates(candidate({ descriptionLength: 10 }), NOW),
    ]);
    expect(report.evaluated).toBe(4);
    expect(report.published).toBe(1);
    expect(report.rejectedByGate).toMatchObject({
      source_rights: 1,
      application_destination: 1,
      minimum_content: 1,
    });
  });
});
