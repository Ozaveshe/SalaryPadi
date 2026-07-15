import { describe, expect, it } from "vitest";

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

const dimension = (result: MatchResult, code: string) =>
  result.dimensions.find((entry) => entry.code === code);

const scoreOf = (result: MatchResult, code: string) =>
  dimension(result, code)?.score ?? 0;

describe("scoreJobMatch", () => {
  it("scores an aligned candidate and job as a strong match with full coverage", () => {
    const result = scoreJobMatch(candidate(), job());

    expect(result.tier).toBe("strong_match");
    expect(result.score).toBe(100);
    expect(result.coverage).toBe(1);
    expect(result.improveCoverage).toEqual([]);
  });

  it("is deterministic across repeated calls", () => {
    expect(scoreJobMatch(candidate(), job())).toEqual(
      scoreJobMatch(candidate(), job()),
    );
  });

  it("always reports its limitations", () => {
    expect(
      scoreJobMatch(candidate(), job()).limitations.length,
    ).toBeGreaterThan(0);
  });

  it("does not score skills", () => {
    const codes = scoreJobMatch(candidate(), job()).dimensions.map(
      (entry) => entry.code,
    );

    expect(codes).not.toContain("skills");
    expect(codes).toEqual([
      "experience_level",
      "work_arrangement",
      "location",
      "compensation",
    ]);
  });

  it("discloses that skills are not compared", () => {
    expect(scoreJobMatch(candidate(), job()).limitations.join(" ")).toContain(
      "does not compare skills",
    );
  });

  describe("missing data is excluded, never scored as zero", () => {
    it("does not lower the score when the job published no salary", () => {
      const withPay = scoreJobMatch(candidate(), job());
      const withoutPay = scoreJobMatch(
        candidate(),
        job({ salaryMin: undefined, salaryMax: undefined }),
      );

      // Both sides matched on pay, so dropping the dimension leaves the
      // remaining dimensions' average untouched — only coverage falls.
      expect(withoutPay.score).toBe(withPay.score);
      expect(withoutPay.coverage).toBeLessThan(withPay.coverage);
    });

    it("marks an absent dimension unknown with a zero contribution", () => {
      const result = scoreJobMatch(
        candidate(),
        job({ experienceLevel: "unspecified" }),
      );

      expect(dimension(result, "experience_level")?.state).toBe("unknown");
      expect(dimension(result, "experience_level")?.score).toBe(0);
      expect(result.improveCoverage.length).toBeGreaterThan(0);
    });

    it("reports insufficient data rather than a low score when nothing is comparable", () => {
      const result = scoreJobMatch(
        candidate({
          experienceLevel: "unspecified",
          desiredWorkArrangement: "unspecified",
          locationCountry: undefined,
          desiredSalaryMin: undefined,
          desiredSalaryMax: undefined,
        }),
        job(),
      );

      expect(result.tier).toBe("insufficient_data");
      expect(result.score).toBeNull();
      expect(result.coverage).toBe(0);
    });

    it("reports insufficient data when coverage falls below the floor", () => {
      // Only compensation (weight 20 of 100) remains comparable.
      const result = scoreJobMatch(
        candidate({
          experienceLevel: "unspecified",
          desiredWorkArrangement: "unspecified",
          locationCountry: undefined,
        }),
        job(),
      );

      expect(result.coverage).toBeLessThan(0.4);
      expect(result.tier).toBe("insufficient_data");
      // The score is still computed and surfaced; only the tier withholds it.
      expect(result.score).toBe(100);
    });

    it("distinguishes an unmet requirement from an unknown one", () => {
      const unmet = scoreJobMatch(candidate({ locationCountry: "GH" }), job());
      const unstated = scoreJobMatch(
        candidate(),
        job({
          eligibility: {
            worldwide: false,
            nigeria: "unclear",
            includedCountries: [],
            excludedCountries: [],
          },
        }),
      );

      expect(dimension(unmet, "location")?.state).toBe("scored");
      expect(dimension(unstated, "location")?.state).toBe("unknown");
      expect(unmet.score).toBeLessThan(unstated.score ?? 0);
    });
  });

  describe("experience level", () => {
    it("penalises being under the posting's level more than being over it", () => {
      const under = scoreJobMatch(
        candidate({ experienceLevel: "entry" }),
        job({ experienceLevel: "senior" }),
      );
      const over = scoreJobMatch(
        candidate({ experienceLevel: "executive" }),
        job({ experienceLevel: "mid" }),
      );

      expect(scoreOf(under, "experience_level")).toBeLessThan(
        scoreOf(over, "experience_level"),
      );
    });

    it("never scores an over-levelled candidate to zero", () => {
      const result = scoreJobMatch(
        candidate({ experienceLevel: "executive" }),
        job({ experienceLevel: "entry" }),
      );

      expect(scoreOf(result, "experience_level")).toBeGreaterThan(0);
    });
  });

  describe("compensation", () => {
    it("does not compare pay across currencies", () => {
      const result = scoreJobMatch(
        candidate({ desiredCurrencyCode: "USD" }),
        job({ currencyCode: "NGN" }),
      );

      expect(dimension(result, "compensation")?.state).toBe("unknown");
      expect(dimension(result, "compensation")?.explanation).toContain(
        "across currencies",
      );
    });

    it("does not compare pay across periods", () => {
      const result = scoreJobMatch(
        candidate({ desiredPayPeriod: "annual" }),
        job({ payPeriod: "monthly" }),
      );

      expect(dimension(result, "compensation")?.state).toBe("unknown");
    });

    it("treats pay above the expectation as fully met", () => {
      const result = scoreJobMatch(
        candidate({ desiredSalaryMin: 300_000 }),
        job({ salaryMin: 500_000, salaryMax: 900_000 }),
      );

      expect(scoreOf(result, "compensation")).toBe(1);
    });

    it("lowers the score as published pay falls further below the expectation", () => {
      const slightlyBelow = scoreJobMatch(
        candidate({ desiredSalaryMin: 500_000 }),
        job({ salaryMin: 450_000, salaryMax: 450_000 }),
      );
      const farBelow = scoreJobMatch(
        candidate({ desiredSalaryMin: 500_000 }),
        job({ salaryMin: 200_000, salaryMax: 200_000 }),
      );

      expect(scoreOf(farBelow, "compensation")).toBeLessThan(
        scoreOf(slightlyBelow, "compensation"),
      );
    });
  });

  describe("work arrangement", () => {
    it("scores a remote-seeking candidate against an onsite role at zero", () => {
      const result = scoreJobMatch(
        candidate({ desiredWorkArrangement: "remote" }),
        job({ workArrangement: "onsite" }),
      );

      expect(scoreOf(result, "work_arrangement")).toBe(0);
    });

    it("treats a remote role as mostly satisfying a hybrid preference", () => {
      const result = scoreJobMatch(
        candidate({ desiredWorkArrangement: "hybrid" }),
        job({ workArrangement: "remote" }),
      );

      expect(scoreOf(result, "work_arrangement")).toBeGreaterThan(0.5);
      expect(scoreOf(result, "work_arrangement")).toBeLessThan(1);
    });
  });

  describe("location", () => {
    it("gives partial credit when the candidate is open to relocation", () => {
      const rooted = scoreJobMatch(
        candidate({ locationCountry: "GH", openToRelocation: false }),
        job(),
      );
      const mobile = scoreJobMatch(
        candidate({ locationCountry: "GH", openToRelocation: true }),
        job(),
      );

      expect(scoreOf(rooted, "location")).toBe(0);
      expect(scoreOf(mobile, "location")).toBe(0.5);
    });
  });
});
