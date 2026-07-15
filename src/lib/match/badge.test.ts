import { describe, expect, it } from "vitest";

import { matchBadgeView } from "./badge";
import { scoreJobMatch } from "./score";
import type { CandidateProfile, JobFacts, MatchResult } from "./types";

function candidate(
  overrides: Partial<CandidateProfile> = {},
): CandidateProfile {
  return {
    experienceLevel: "mid",
    desiredWorkArrangement: "remote",
    desiredSalaryMin: 400_000,
    desiredCurrencyCode: "NGN",
    desiredPayPeriod: "monthly",
    locationCountry: "NG",
    openToRelocation: false,
    ...overrides,
  };
}

function job(overrides: Partial<JobFacts> = {}): JobFacts {
  return {
    experienceLevel: "mid",
    workArrangement: "remote",
    salaryMin: 400_000,
    salaryMax: 600_000,
    currencyCode: "NGN",
    payPeriod: "monthly",
    eligibility: {
      worldwide: false,
      nigeria: "eligible",
      includedCountries: ["NG"],
      excludedCountries: [],
    },
    ...overrides,
  };
}

describe("matchBadgeView", () => {
  it("shows a success tone for a strong match", () => {
    const view = matchBadgeView(scoreJobMatch(candidate(), job()));

    expect(view?.tone).toBe("success");
    expect(view?.label).toBe("Strong match · 100");
  });

  it("shows a neutral tone for a possible match", () => {
    const view = matchBadgeView(
      scoreJobMatch(
        candidate({
          desiredWorkArrangement: "onsite",
          experienceLevel: "entry",
        }),
        job({ experienceLevel: "executive" }),
      ),
    );

    expect(view?.tone).toBe("neutral");
    expect(view?.label).toContain("Possible match");
  });

  it("shows a neutral tone for a limited match", () => {
    const view = matchBadgeView(
      scoreJobMatch(
        candidate({
          experienceLevel: "entry",
          desiredWorkArrangement: "remote",
          locationCountry: "GH",
          desiredSalaryMin: 400_000,
        }),
        job({
          experienceLevel: "executive",
          workArrangement: "onsite",
          salaryMin: 100_000,
          salaryMax: 100_000,
        }),
      ),
    );

    expect(view?.tone).toBe("neutral");
    expect(view?.label).toContain("Limited match");
  });

  it("renders nothing rather than a misleading score when data is insufficient", () => {
    const view = matchBadgeView(
      scoreJobMatch(
        candidate({
          experienceLevel: "unspecified",
          desiredWorkArrangement: "unspecified",
          locationCountry: undefined,
          desiredSalaryMin: undefined,
        }),
        job(),
      ),
    );

    expect(view).toBeNull();
  });

  it("renders nothing when there is no score at all", () => {
    const empty = {
      tier: "limited_match",
      score: null,
      coverage: 0,
      dimensions: [],
      improveCoverage: [],
      limitations: [],
      label: "",
      summary: "",
    } satisfies MatchResult;

    expect(matchBadgeView(empty)).toBeNull();
  });

  describe("the description never lets a bare number travel alone", () => {
    it("says what the score is measured against", () => {
      const view = matchBadgeView(scoreJobMatch(candidate(), job()));

      expect(view?.description).toContain("what you attested");
      expect(view?.description).toContain(
        "not an assessment of your suitability",
      );
    });

    it("discloses partial coverage", () => {
      const view = matchBadgeView(
        scoreJobMatch(candidate(), job({ experienceLevel: "unspecified" })),
      );

      expect(view?.description).toContain("70%");
      expect(view?.description).toContain("not stated");
    });

    it("states when everything was compared", () => {
      const view = matchBadgeView(scoreJobMatch(candidate(), job()));

      expect(view?.description).toContain("Every comparable point");
    });
  });
});
