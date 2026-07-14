import { describe, expect, it } from "vitest";

import { parseSalary } from "../normalize";
import { classifyDuplicate, chooseCanonicalAuthority } from "./dedupe";
import { extractCompleteEligibilityEvidence } from "./eligibility-evidence";
import { reconcileLifecycle, type LifecycleEvidence } from "./lifecycle";
import { occurrenceIdempotencyKey } from "./occurrence";
import { normalizeSalaryEvidence } from "./salary";

const firstSeenAt = "2026-07-14T00:00:00.000Z";
const baseCandidate = {
  id: "secondary",
  fingerprint: "a".repeat(64),
  title: "Senior Platform Engineer",
  company: "Padi Labs",
  location: "Lagos, Nigeria",
  arrangement: "employee" as const,
  applicationUrl: "https://jobs.example.test/openings/secondary",
  authority: "secondary_feed" as const,
  firstSeenAt,
};

describe("occurrence preservation and deduplication", () => {
  it("is idempotent within one run but preserves the same source item across runs", () => {
    const identity = {
      sourceId: "source-1",
      externalSourceId: "job-42",
      runId: "run-1",
      contentHash: "b".repeat(64),
    };
    expect(occurrenceIdempotencyKey(identity)).toBe(
      occurrenceIdempotencyKey(identity),
    );
    expect(occurrenceIdempotencyKey(identity)).not.toBe(
      occurrenceIdempotencyKey({ ...identity, runId: "run-2" }),
    );
  });

  it("chooses canonical authority direct > ATS > licensed > secondary", () => {
    const candidates = [
      baseCandidate,
      {
        ...baseCandidate,
        id: "partner",
        authority: "licensed_partner" as const,
      },
      { ...baseCandidate, id: "ats", authority: "employer_ats" as const },
      { ...baseCandidate, id: "direct", authority: "direct_employer" as const },
    ];
    expect(chooseCanonicalAuthority(candidates).id).toBe("direct");
    expect(classifyDuplicate(candidates[0]!, candidates[3]!)).toEqual({
      kind: "exact",
      canonicalId: "direct",
      duplicateId: "secondary",
    });
  });

  it("queues a conservative fuzzy candidate for review but never auto-merges it", () => {
    expect(
      classifyDuplicate(baseCandidate, {
        ...baseCandidate,
        id: "possible",
        fingerprint: "c".repeat(64),
        title: "Platform Engineer, Senior",
        applicationUrl: "https://jobs.example.test/openings/possible",
      }),
    ).toMatchObject({ kind: "fuzzy_review", titleSimilarity: 1 });
  });

  it("keeps fuzzy records distinct when company, location, or destination differs", () => {
    expect(
      classifyDuplicate(baseCandidate, {
        ...baseCandidate,
        id: "distinct",
        fingerprint: "d".repeat(64),
        company: "Different Employer",
        applicationUrl: "https://other.example.test/openings/possible",
      }),
    ).toMatchObject({ kind: "distinct" });
  });
});

describe("job lifecycle", () => {
  const open: LifecycleEvidence = {
    state: "open",
    successfulAbsenceCount: 0,
    firstSuccessfulAbsenceAt: null,
    lastSuccessfulAbsenceAt: null,
    validThrough: null,
    sourceType: "automated",
    lastConfirmedAt: firstSeenAt,
  };

  it("moves first successful absence to checking and waits 30 minutes", () => {
    const checking = reconcileLifecycle(open, {
      type: "absent",
      outcome: "complete",
      at: "2026-07-14T01:00:00.000Z",
    });
    expect(checking).toMatchObject({
      state: "checking",
      successfulAbsenceCount: 1,
      reason: "first_successful_absence",
    });
    expect(
      reconcileLifecycle(checking, {
        type: "absent",
        outcome: "complete",
        at: "2026-07-14T01:29:59.000Z",
      }),
    ).toMatchObject({
      state: "checking",
      successfulAbsenceCount: 1,
      reason: "absence_waiting_for_30_minutes",
    });
    expect(
      reconcileLifecycle(checking, {
        type: "absent",
        outcome: "complete",
        at: "2026-07-14T01:30:00.000Z",
      }),
    ).toMatchObject({ state: "closed", reason: "second_successful_absence" });
  });

  it.each(["partial", "failed", "timed_out", "http_403", "http_429"] as const)(
    "%s never closes or advances absence evidence",
    (outcome) => {
      expect(
        reconcileLifecycle(open, {
          type: "absent",
          outcome,
          at: "2026-07-14T01:00:00.000Z",
        }),
      ).toMatchObject({
        state: "open",
        successfulAbsenceCount: 0,
        changed: false,
        reason: "non_authoritative_run",
      });
    },
  );

  it("closes confirmed source closures immediately", () => {
    expect(
      reconcileLifecycle(open, {
        type: "confirmed_closed",
        at: "2026-07-14T00:00:01.000Z",
      }),
    ).toMatchObject({ state: "closed", reason: "confirmed_source_closure" });
  });

  it("closes elapsed deadlines and unreconfirmed 30-day manual jobs", () => {
    expect(
      reconcileLifecycle(
        { ...open, validThrough: "2026-07-14T00:15:00.000Z" },
        { type: "maintenance", at: "2026-07-14T00:15:00.000Z" },
      ),
    ).toMatchObject({ state: "closed", reason: "deadline_elapsed" });
    expect(
      reconcileLifecycle(
        { ...open, sourceType: "manual" },
        { type: "maintenance", at: "2026-08-13T00:00:00.000Z" },
      ),
    ).toMatchObject({
      state: "closed",
      reason: "manual_reconfirmation_overdue",
    });
  });
});

describe("salary and eligibility evidence", () => {
  it("preserves the source salary and labels derived values and assumptions", () => {
    const normalized = normalizeSalaryEvidence({
      sourceText: "USD 50/hour gross for Nigeria",
      currency: "USD",
      minimum: 50,
      maximum: 50,
      period: "hourly",
      locationScope: "Nigeria",
      grossNet: "gross",
    });
    expect(normalized.source).toMatchObject({
      sourceText: "USD 50/hour gross for Nigeria",
      minimum: 50,
      period: "hourly",
    });
    expect(normalized.annual).toMatchObject({
      minimum: 104_000,
      derived: true,
      assumptions: ["40 work hours per week", "52 paid weeks per year"],
    });
    expect(normalized.monthly).toMatchObject({
      minimum: 8_666.67,
      derived: true,
    });
  });

  it("does not derive a period when the source period is unknown", () => {
    expect(
      normalizeSalaryEvidence({
        sourceText: "NGN 500,000",
        currency: "NGN",
        minimum: 500_000,
        maximum: null,
        period: "unknown",
        locationScope: null,
        grossNet: "unknown",
      }),
    ).toMatchObject({ annual: null, monthly: null });
  });

  it("parses a decimal comma magnitude without tenfold annualization", () => {
    expect(parseSalary("USD 31,2k per year")).toMatchObject({
      minimum: 31_200,
      maximum: 31_200,
      payPeriod: "annual",
    });
  });

  it("stores all explicit eligibility dimensions and keeps generic remote unclear", () => {
    expect(
      extractCompleteEligibilityEvidence(
        "Remote. Applicants must reside in Nigeria; applicants in the United States are excluded and must have the right to work. No visa sponsorship. Independent contractor. UTC+1 to UTC+3.",
        firstSeenAt,
      ),
    ).toMatchObject({
      includedCountryCodes: ["NG"],
      excludedCountryCodes: ["US"],
      workAuthorization: expect.stringMatching(/right to work/i),
      visaSponsorship: "no",
      physicalLocation: expect.stringMatching(/reside in Nigeria/i),
      arrangement: "contractor",
      timezone: expect.stringMatching(/UTC\+1/i),
    });
    expect(
      extractCompleteEligibilityEvidence("Remote", firstSeenAt),
    ).toMatchObject({
      scope: "unclear",
      includedCountryCodes: [],
      excludedCountryCodes: [],
      arrangement: "unknown",
    });
  });
});
