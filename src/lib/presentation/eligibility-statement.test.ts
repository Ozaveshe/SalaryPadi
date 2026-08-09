import { describe, expect, it } from "vitest";

import type { Job, JobEligibility } from "@/lib/jobs/types";
import { eligibilityStateFor } from "@/lib/search/rank-adapter";

import {
  eligibilityStatementTone,
  publicEligibilityStatement,
} from "./public-field";

function remoteJob(eligibility: Partial<JobEligibility>): Job {
  return {
    id: "job-1",
    slug: "senior-analyst",
    title: "Senior Analyst",
    company: { name: "Padi Labs", slug: "padi-labs" },
    applicationUrl: "https://boards.greenhouse.io/padilabs/jobs/1",
    workMode: "remote",
    locationDisplay: "Remote",
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
      ...eligibility,
    },
  } as unknown as Job;
}

describe("eligibility statement basis", () => {
  it("keeps the Nigeria-specific claim for explicit Nigeria evidence only", () => {
    const statement = publicEligibilityStatement(
      remoteJob({
        scope: "nigeria",
        nigeria: "eligible",
        africa: "eligible",
        includedCountries: ["Nigeria"],
      }),
    );
    expect(statement).toBe("Applicants in Nigeria can apply");
    expect(eligibilityStatementTone(statement!)).toBe("success");
  });

  it("states worldwide wording as worldwide, not as a Nigeria claim", () => {
    const statement = publicEligibilityStatement(
      remoteJob({
        scope: "worldwide",
        nigeria: "eligible",
        africa: "eligible",
      }),
    );
    expect(statement).toBe("Open to applicants worldwide");
    expect(eligibilityStatementTone(statement!)).toBe("success");
  });

  it("states Africa-wide wording as Africa-wide", () => {
    const statement = publicEligibilityStatement(
      remoteJob({ scope: "africa", nigeria: "eligible", africa: "eligible" }),
    );
    expect(statement).toBe("Open to applicants across Africa");
    expect(eligibilityStatementTone(statement!)).toBe("success");
  });

  it("never gives a success tone to a role a Nigerian cannot apply to", () => {
    const job = remoteJob({
      scope: "named_countries",
      nigeria: "not_eligible",
      africa: "eligible",
      includedCountries: ["Kenya", "Ghana"],
    });
    const statement = publicEligibilityStatement(job);
    expect(statement).toBe(
      "Open in named African countries, not including Nigeria",
    );
    expect(eligibilityStatementTone(statement!)).toBe("neutral");
  });

  it("marks an explicit Nigeria exclusion as not open", () => {
    const statement = publicEligibilityStatement(
      remoteJob({
        scope: "restricted_region",
        nigeria: "not_eligible",
        excludedCountries: ["Nigeria"],
      }),
    );
    expect(statement).toBe("Not open to applicants in Nigeria");
    expect(eligibilityStatementTone(statement!)).toBe("danger");
  });

  it("stays silent on generic remote wording", () => {
    expect(publicEligibilityStatement(remoteJob({}))).toBeNull();
  });
});

describe("statement and ranking agree", () => {
  /**
   * The card and the ranker read the same evidence; a job the ranker scores
   * not-eligible must never carry a success-toned public statement, and a
   * success-toned statement must never sit on a not-eligible job. This is the
   * cross-surface contradiction the 2026-08 audit found in production.
   */
  const cases: Array<Partial<JobEligibility>> = [
    { scope: "nigeria", nigeria: "eligible", africa: "eligible" },
    { scope: "worldwide", nigeria: "eligible", africa: "eligible" },
    { scope: "africa", nigeria: "eligible", africa: "eligible" },
    {
      scope: "named_countries",
      nigeria: "eligible",
      africa: "eligible",
      includedCountries: ["Nigeria", "Ghana"],
    },
    {
      scope: "named_countries",
      nigeria: "not_eligible",
      africa: "eligible",
      includedCountries: ["Kenya", "Ghana"],
    },
    { scope: "emea", nigeria: "unclear", africa: "eligible" },
    { scope: "unclear", nigeria: "unclear", africa: "unclear" },
    {
      scope: "worldwide",
      nigeria: "not_eligible",
      africa: "eligible",
      excludedCountries: ["NG"],
    },
  ];

  it.each(cases)("case %#: tone never contradicts the ranker", (overrides) => {
    const job = remoteJob(overrides);
    const state = eligibilityStateFor(job);
    const statement = publicEligibilityStatement(job);
    const tone = statement ? eligibilityStatementTone(statement) : null;

    if (state === "not_eligible") {
      expect(tone).not.toBe("success");
    }
    if (tone === "success") {
      expect([
        "nigeria_explicit",
        "africa_explicit",
        "global_remote_reviewed",
      ]).toContain(state);
    }
  });
});
