import { describe, expect, it } from "vitest";

import {
  assessMerge,
  resolveEmployer,
  type EmployerCandidate,
} from "./employer-identity";
import {
  compareJobs,
  jobFingerprint,
  preferredOccurrence,
  type JobIdentityFacts,
} from "./job-identity";
import {
  classifyEligibilityText,
  deriveVerdict,
  isBareRemote,
  type EligibilityEvidence,
} from "./eligibility-evidence";
import {
  detectConflict,
  resolveSalary,
  type SalaryEvidence,
} from "./salary-evidence";
import {
  exceedsUnconfirmedWindow,
  nextLifecycleState,
  outcomeProvesAbsence,
  type LifecycleInput,
} from "./job-lifecycle";

const MONIEPOINT: EmployerCandidate = {
  companyId: "cmp-moniepoint",
  displayName: "Moniepoint",
  atsTenants: ["greenhouse:moniepoint"],
  domains: ["moniepoint.com"],
  aliases: ["Moniepoint Inc", "TeamApt"],
};

const MONIEPOINT_MFB: EmployerCandidate = {
  companyId: "cmp-moniepoint-mfb",
  displayName: "Moniepoint MFB",
  parentCompanyId: "cmp-moniepoint",
  domains: ["moniepointmfb.com"],
};

const CARBON_US: EmployerCandidate = {
  companyId: "cmp-carbon-us",
  displayName: "Carbon",
  atsTenants: ["greenhouse:carbon"],
  domains: ["carbon.com"],
};

// ---------------------------------------------------------------- employers

describe("employer identity", () => {
  it("resolves on ATS tenant before anything else", () => {
    const result = resolveEmployer(
      { atsTenant: "greenhouse:moniepoint", rawName: "Totally Different Ltd" },
      [MONIEPOINT, CARBON_US],
    );
    expect(result).toMatchObject({
      state: "resolved",
      companyId: "cmp-moniepoint",
      evidence: "ats_tenant",
    });
  });

  it("resolves an employer alias to the canonical record", () => {
    const result = resolveEmployer({ rawName: "TeamApt" }, [MONIEPOINT]);
    expect(result).toMatchObject({
      state: "resolved",
      companyId: "cmp-moniepoint",
      evidence: "exact_alias",
    });
  });

  it("does not resolve a lookalike tenant to the wrong company", () => {
    // greenhouse:carbon is a US company, not Nigeria's Carbon.
    const result = resolveEmployer(
      { atsTenant: "greenhouse:carbon", rawName: "Carbon" },
      [CARBON_US, MONIEPOINT],
    );
    expect(result).toMatchObject({ companyId: "cmp-carbon-us" });
  });

  it("sends a name-only similarity to review, never to a merge", () => {
    const result = resolveEmployer({ rawName: "Moniepoint Payments" }, [
      MONIEPOINT,
    ]);
    expect(result.state).toBe("review");
  });

  it("sends a domain claimed by several companies to review", () => {
    const shared: EmployerCandidate[] = [
      { companyId: "a", displayName: "A", domains: ["shared.example"] },
      { companyId: "b", displayName: "B", domains: ["shared.example"] },
    ];
    const result = resolveEmployer(
      { destinationHost: "shared.example", rawName: "Something" },
      shared,
    );
    expect(result.state).toBe("review");
  });

  it("refuses to merge a parent into its subsidiary", () => {
    const assessment = assessMerge(MONIEPOINT, MONIEPOINT_MFB, "exact_alias");
    expect(assessment.allowed).toBe(false);
    expect(assessment.requiresReview).toBe(false);
    expect(assessment.reason).toMatch(/regulator|distinct legal/i);
  });

  it("never merges on name similarity alone", () => {
    const assessment = assessMerge(MONIEPOINT, CARBON_US, "fuzzy_name");
    expect(assessment.allowed).toBe(false);
    expect(assessment.requiresReview).toBe(true);
  });

  it("allows a merge when both records claim the same ATS tenant", () => {
    const duplicate: EmployerCandidate = {
      companyId: "cmp-dupe",
      displayName: "Moniepoint (duplicate)",
      atsTenants: ["greenhouse:moniepoint"],
    };
    expect(assessMerge(MONIEPOINT, duplicate, "ats_tenant").allowed).toBe(true);
  });
});

// --------------------------------------------------------------------- jobs

const baseJob: JobIdentityFacts = {
  employerId: "cmp-moniepoint",
  title: "Senior Backend Engineer",
  locationKey: "NG-LA",
  workArrangement: "onsite",
  employmentType: "full_time",
  destinationHost: "boards.greenhouse.io",
};

describe("job identity", () => {
  it("treats the same job from multiple sources as one vacancy", () => {
    const viaAts = { ...baseJob, requisitionId: "REQ-123" };
    const viaAggregator = {
      ...baseJob,
      requisitionId: "REQ-123",
      destinationHost: "linkedin.com",
      title: "Senior Backend Engineer (Remote)",
    };
    expect(compareJobs(viaAts, viaAggregator)).toMatchObject({ kind: "same" });
  });

  it("keeps different jobs with identical titles apart", () => {
    const lagos = { ...baseJob, locationKey: "NG-LA" };
    const abuja = { ...baseJob, locationKey: "NG-FC" };
    expect(compareJobs(lagos, abuja).kind).toBe("different");
  });

  it("trusts the employer when it gives two roles different requisition IDs", () => {
    const a = { ...baseJob, requisitionId: "REQ-1" };
    const b = { ...baseJob, requisitionId: "REQ-2" };
    expect(compareJobs(a, b).kind).toBe("different");
  });

  it("never compares jobs across different employers", () => {
    const other = { ...baseJob, employerId: "cmp-other" };
    expect(compareJobs(baseJob, other).kind).toBe("different");
  });

  it("queues a near-identical title for review rather than merging it", () => {
    const a = { ...baseJob, locationKey: null, publishedAt: "2026-07-01" };
    const b = {
      ...baseJob,
      locationKey: null,
      title: "Senior Backend Engineer",
      destinationHost: "jobs.lever.co",
      publishedAt: "2026-07-10",
    };
    const decision = compareJobs(a, b);
    expect(decision.kind).toBe("review");
  });

  it("does not deduplicate on title alone", () => {
    // Same normalised title, different employers and destinations.
    const a = { ...baseJob, employerId: "cmp-a", locationKey: null };
    const b = { ...baseJob, employerId: "cmp-b", locationKey: null };
    expect(compareJobs(a, b).kind).toBe("different");
  });

  it("produces a stable fingerprint and prefers the requisition ID", () => {
    expect(jobFingerprint({ ...baseJob, requisitionId: "REQ-9" })).toBe(
      "req:cmp-moniepoint:req-9",
    );
    expect(jobFingerprint(baseJob)).toBe(jobFingerprint({ ...baseJob }));
  });

  it("prefers the direct ATS occurrence over an aggregator", () => {
    const chosen = preferredOccurrence([
      {
        occurrenceId: "agg",
        authority: "secondary_feed",
        observedAt: "2026-07-31T00:00:00Z",
      },
      {
        occurrenceId: "ats",
        authority: "employer_ats",
        observedAt: "2026-07-01T00:00:00Z",
      },
    ]);
    // Recency does not beat authority.
    expect(chosen?.occurrenceId).toBe("ats");
  });
});

// -------------------------------------------------------------- eligibility

function evidence(
  overrides: Partial<EligibilityEvidence> = {},
): EligibilityEvidence {
  return {
    type: "eligibility_unclear",
    sourceText: "Remote",
    inclusion: "neutral",
    extractionMethod: "pattern",
    confidence: "low",
    ...overrides,
  };
}

describe("eligibility evidence", () => {
  it("never infers Nigeria eligibility from a bare remote", () => {
    expect(isBareRemote("Remote")).toBe(true);
    const classified = classifyEligibilityText("Remote");
    expect(classified.type).toBe("eligibility_unclear");
    expect(deriveVerdict([classified]).verdict).toBe("unclear");
  });

  it("recognises an explicit Nigeria inclusion", () => {
    const classified = classifyEligibilityText("Remote (Nigeria)");
    expect(classified.type).toBe("explicitly_accepts_nigeria");
    expect(deriveVerdict([classified]).verdict).toBe("eligible");
  });

  it("recognises an explicit Nigeria exclusion and lets it win", () => {
    const excluded = classifyEligibilityText(
      "Remote across Africa, not available in Nigeria",
    );
    expect(excluded.type).toBe("explicitly_excludes_nigeria");
    const verdict = deriveVerdict([
      evidence({ type: "explicitly_accepts_africa", inclusion: "include" }),
      excluded,
    ]);
    expect(verdict.verdict).toBe("not_eligible");
  });

  it("does not treat mission-statement 'anywhere' as global remote", () => {
    // "essential goods anytime, anywhere" once published a US-only role.
    const classified = classifyEligibilityText(
      "We deliver essential goods anytime, anywhere",
    );
    expect(classified.type).not.toBe("global_remote");
  });

  it("accepts genuinely global wording", () => {
    expect(
      classifyEligibilityText("Work from anywhere in the world").type,
    ).toBe("global_remote");
  });

  it("treats Africa and EMEA as containing Nigeria", () => {
    for (const text of ["Remote - Africa", "Remote (EMEA)"]) {
      expect(deriveVerdict([classifyEligibilityText(text)]).verdict).toBe(
        "eligible",
      );
    }
  });

  it("marks a remote role restricted to other countries as not eligible", () => {
    const verdict = deriveVerdict([
      evidence({
        type: "remote_with_country_restrictions",
        sourceText: "Remote (US and Canada only)",
        countries: ["US", "CA"],
        inclusion: "include",
      }),
    ]);
    expect(verdict.verdict).toBe("not_eligible");
  });

  it("distinguishes saying nothing from saying something unresolved", () => {
    expect(deriveVerdict([]).verdict).toBe("not_stated");
    expect(deriveVerdict([evidence()]).verdict).toBe("unclear");
  });

  it("carries the source text into the basis so a badge is traceable", () => {
    const verdict = deriveVerdict([classifyEligibilityText("Open to Nigeria")]);
    expect(verdict.basis).toContain("Open to Nigeria");
  });
});

// ------------------------------------------------------------------ salary

function salary(overrides: Partial<SalaryEvidence> = {}): SalaryEvidence {
  return {
    originalText: "₦600,000 - ₦700,000 per month",
    minimum: 600_000,
    maximum: 700_000,
    currency: "NGN",
    payPeriod: "monthly",
    grossNet: "unspecified",
    basis: "base",
    origin: "employer_disclosed",
    extractionConfidence: "high",
    ...overrides,
  };
}

describe("salary evidence", () => {
  it("never turns an undisclosed salary into a stated one", () => {
    const resolution = resolveSalary([
      salary({ minimum: null, maximum: null, currency: null }),
    ]);
    expect(resolution.state).toBe("undisclosed");
  });

  it("keeps a derived estimate out of the disclosed slot", () => {
    const resolution = resolveSalary([
      salary({ origin: "derived_estimate", extractionConfidence: "high" }),
    ]);
    expect(resolution.state).toBe("undisclosed");
  });

  it("reports conflicting currencies rather than choosing one", () => {
    const conflict = detectConflict(salary(), salary({ currency: "USD" }));
    expect(conflict.kind).toBe("currency");
    expect(resolveSalary([salary(), salary({ currency: "USD" })]).state).toBe(
      "conflict",
    );
  });

  it("reports conflicting pay periods", () => {
    expect(detectConflict(salary(), salary({ payPeriod: "annual" })).kind).toBe(
      "period",
    );
  });

  it("reports figures that differ by an implausible magnitude", () => {
    const conflict = detectConflict(
      salary(),
      salary({ minimum: 60_000, maximum: 70_000 }),
    );
    expect(conflict.kind).toBe("magnitude");
  });

  it("never averages two disagreeing figures into a new number", () => {
    const resolution = resolveSalary([
      salary(),
      salary({ minimum: 60_000, maximum: 70_000 }),
    ]);
    expect(resolution.state).toBe("conflict");
    expect(resolution).not.toHaveProperty("evidence");
  });

  it("publishes agreeing figures, preferring higher confidence", () => {
    const resolution = resolveSalary([
      salary({ extractionConfidence: "low", originalText: "low-confidence" }),
      salary({ extractionConfidence: "high", originalText: "high-confidence" }),
    ]);
    expect(resolution.state).toBe("disclosed");
    if (resolution.state === "disclosed") {
      expect(resolution.evidence.originalText).toBe("high-confidence");
    }
  });
});

// --------------------------------------------------------------- lifecycle

function lifecycle(overrides: Partial<LifecycleInput> = {}): LifecycleInput {
  return {
    state: "active",
    successfulOmissions: 0,
    rightsPermitPublication: true,
    consecutiveSourceFailures: 0,
    ...overrides,
  };
}

describe("job lifecycle", () => {
  it("never treats a source timeout as proof of closure", () => {
    expect(outcomeProvesAbsence("timed_out")).toBe(false);
    const result = nextLifecycleState(lifecycle(), {
      outcome: "timed_out",
      seen: false,
    });
    expect(result.state).not.toBe("closed");
  });

  it("marks a repeatedly failing source as delayed, not empty", () => {
    const result = nextLifecycleState(
      lifecycle({ consecutiveSourceFailures: 1 }),
      { outcome: "rate_limited", seen: false },
    );
    expect(result.state).toBe("source_delayed");
  });

  it("moves to possibly active on the first proven absence", () => {
    const result = nextLifecycleState(lifecycle(), {
      outcome: "complete",
      seen: false,
    });
    expect(result.state).toBe("possibly_active");
  });

  it("does not close on two rapid ticks", () => {
    const now = new Date("2026-08-01T12:00:00Z");
    const result = nextLifecycleState(
      lifecycle({
        state: "possibly_active",
        successfulOmissions: 1,
        firstSuccessfulAbsenceAt: "2026-08-01T11:50:00Z",
      }),
      { outcome: "complete", seen: false },
      now,
    );
    expect(result.state).not.toBe("closed");
  });

  it("closes after a second proven absence past the grace window", () => {
    const now = new Date("2026-08-01T12:00:00Z");
    const result = nextLifecycleState(
      lifecycle({
        state: "possibly_active",
        successfulOmissions: 1,
        firstSuccessfulAbsenceAt: "2026-08-01T11:00:00Z",
      }),
      { outcome: "complete", seen: false },
      now,
    );
    expect(result.state).toBe("closed");
  });

  it("resets absence evidence when the job is seen again", () => {
    const result = nextLifecycleState(
      lifecycle({ state: "possibly_active", successfulOmissions: 1 }),
      { outcome: "complete", seen: true },
    );
    expect(result.state).toBe("active");
  });

  it("expires a job whose stated deadline has passed", () => {
    const result = nextLifecycleState(
      lifecycle({ validThrough: "2026-01-01T00:00:00Z" }),
      { outcome: "complete", seen: true },
      new Date("2026-08-01T00:00:00Z"),
    );
    expect(result.state).toBe("expired");
  });

  it("withdraws a job when source rights stop permitting publication", () => {
    const result = nextLifecycleState(
      lifecycle({ rightsPermitPublication: false }),
      { outcome: "complete", seen: true },
    );
    expect(result.state).toBe("rights_blocked");
  });

  it("does not let ingestion override a manual review hold", () => {
    const result = nextLifecycleState(lifecycle({ state: "manual_review" }), {
      outcome: "complete",
      seen: false,
    });
    expect(result.state).toBe("manual_review");
    expect(result.changed).toBe(false);
  });

  it("does not reopen a job already marked duplicate", () => {
    const result = nextLifecycleState(lifecycle({ state: "duplicate" }), {
      outcome: "complete",
      seen: true,
    });
    expect(result.state).toBe("duplicate");
  });

  it("does not let an undated job stay active forever", () => {
    expect(
      exceedsUnconfirmedWindow(
        "2026-01-01T00:00:00Z",
        new Date("2026-08-01T00:00:00Z"),
      ),
    ).toBe(true);
    expect(
      exceedsUnconfirmedWindow(
        "2026-07-28T00:00:00Z",
        new Date("2026-08-01T00:00:00Z"),
      ),
    ).toBe(false);
  });
});
