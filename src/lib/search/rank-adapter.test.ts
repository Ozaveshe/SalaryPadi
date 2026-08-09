import { describe, expect, it } from "vitest";

import type { Job } from "@/lib/jobs/types";

import {
  eligibilityStateFor,
  sourceAuthorityFor,
  toRankableJob,
} from "./rank-adapter";

function job(overrides: Record<string, unknown> = {}): Job {
  return {
    id: "job-1",
    slug: "senior-analyst",
    title: "Senior Analyst",
    company: { name: "Moniepoint", slug: "moniepoint" },
    applicationUrl: "https://boards.greenhouse.io/moniepoint/jobs/1",
    workMode: "remote",
    postedAt: "2026-08-01T00:00:00Z",
    lastCheckedAt: "2026-08-02T10:00:00Z",
    salary: null,
    source: { type: "employer" },
    eligibility: {
      scope: "unclear",
      nigeria: "unclear",
      africa: "unclear",
      includedCountries: [],
      excludedCountries: [],
    },
    ...overrides,
  } as unknown as Job;
}

describe("eligibility mapping", () => {
  it("maps an explicit Nigeria decision", () => {
    expect(
      eligibilityStateFor(
        job({
          eligibility: {
            scope: "unclear",
            nigeria: "eligible",
            africa: "unclear",
            includedCountries: ["NG"],
            excludedCountries: [],
          },
        }),
      ),
    ).toBe("nigeria_explicit");
  });

  it("maps reviewed worldwide wording below the explicit Nigeria rung", () => {
    // "Work from anywhere" lets a Nigerian apply, but it is not Nigeria
    // evidence; scoring it as nigeria_explicit left this rung unreachable.
    expect(
      eligibilityStateFor(
        job({
          eligibility: {
            scope: "worldwide",
            nigeria: "eligible",
            africa: "eligible",
            includedCountries: [],
            excludedCountries: [],
          },
        }),
      ),
    ).toBe("global_remote_reviewed");
  });

  it("maps Africa-wide wording to africa_explicit", () => {
    expect(
      eligibilityStateFor(
        job({
          eligibility: {
            scope: "africa",
            nigeria: "eligible",
            africa: "eligible",
            includedCountries: [],
            excludedCountries: [],
          },
        }),
      ),
    ).toBe("africa_explicit");
  });

  it("maps EMEA scope to africa_explicit while Nigeria stays unconfirmed", () => {
    expect(
      eligibilityStateFor(
        job({
          eligibility: {
            scope: "emea",
            nigeria: "unclear",
            africa: "eligible",
            includedCountries: [],
            excludedCountries: [],
          },
        }),
      ),
    ).toBe("africa_explicit");
  });

  it("lets an explicit exclusion beat everything else", () => {
    // Africa-eligible plus a Nigeria exclusion is still not eligible.
    expect(
      eligibilityStateFor(
        job({
          eligibility: {
            scope: "worldwide",
            nigeria: "eligible",
            africa: "eligible",
            includedCountries: [],
            excludedCountries: ["NG"],
          },
        }),
      ),
    ).toBe("not_eligible");
  });

  it("never upgrades an unresolved job to eligible", () => {
    // The ranker must not be where eligibility quietly improves.
    expect(eligibilityStateFor(job())).toBe("unclear");
  });

  it("treats an onsite job with no evidence as local-presence required", () => {
    expect(eligibilityStateFor(job({ workMode: "onsite" }))).toBe(
      "local_presence_required",
    );
  });
});

describe("source authority mapping", () => {
  it("ranks a direct employer submission highest", () => {
    expect(sourceAuthorityFor(job({ source: { type: "manual" } }))).toBe(
      "direct_employer",
    );
  });

  it("maps the reviewed policy types onto the authority ladder", () => {
    expect(sourceAuthorityFor(job({ source: { type: "employer" } }))).toBe(
      "employer_ats",
    );
    expect(sourceAuthorityFor(job({ source: { type: "partner" } }))).toBe(
      "licensed_partner",
    );
    expect(sourceAuthorityFor(job({ source: { type: "permitted_api" } }))).toBe(
      "secondary_feed",
    );
  });
});

describe("adapter output", () => {
  const now = new Date("2026-08-02T12:00:00Z");

  it("never assumes an unchecked apply link is healthy", () => {
    // Assuming health would let a dead link rank as though verified.
    expect(toRankableJob(job(), { textRelevance: 1, now }).applyLinkState).toBe(
      "unchecked",
    );
  });

  it("classifies the destination from the apply URL", () => {
    expect(
      toRankableJob(job(), { textRelevance: 1, now }).destinationKind,
    ).toBe("employer_ats");
  });

  it("reports salary as undisclosed when the job states none", () => {
    expect(
      toRankableJob(job(), { textRelevance: 1, now }).salaryDisclosed,
    ).toBe(false);
  });

  it("derives freshness from posting and confirmation times", () => {
    const rankable = toRankableJob(job(), { textRelevance: 1, now });
    expect(rankable.daysSincePosted).toBeCloseTo(1.5, 1);
    expect(rankable.hoursSinceConfirmed).toBeCloseTo(2, 1);
  });
});
