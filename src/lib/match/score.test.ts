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
    // Full coverage now means all five dimensions had data, so the candidate
    // has to have supplied a CV as well.
    const result = scoreJobMatch(
      candidate({ cvSkills: ["Python"] }),
      job({ namedSkills: ["Python"] }),
    );

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

  it("compares five dimensions, skills among them", () => {
    const codes = scoreJobMatch(candidate(), job()).dimensions.map(
      (entry) => entry.code,
    );

    expect(codes).toEqual([
      "experience_level",
      "skills",
      "work_arrangement",
      "location",
      "compensation",
    ]);
  });

  it("discloses what the skills line does and does not claim", () => {
    const stated = scoreJobMatch(candidate(), job()).limitations.join(" ");

    expect(stated).toContain("name the same terms");
    expect(stated).toContain("not a judgement that you meet the role");
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

describe("skills dimension", () => {
  const dimension = (result: MatchResult) =>
    result.dimensions.find((d) => d.code === "skills")!;

  it("stays unknown when the candidate has uploaded no readable CV", () => {
    // Absent evidence must not read as zero overlap. A candidate is never
    // penalised for what they have not told us.
    const d = dimension(
      scoreJobMatch(candidate(), job({ namedSkills: ["Python"] })),
    );
    expect(d.state).toBe("unknown");
    expect(d.score).toBe(0);
    expect(d.explanation).toMatch(/Upload a CV/i);
  });

  it("stays unknown when the posting names nothing the vocabulary knows", () => {
    // Scoring this as zero would punish a role for being described in words
    // the fixed list happens not to carry.
    const d = dimension(
      scoreJobMatch(
        candidate({ cvSkills: ["Python"] }),
        job({ namedSkills: [] }),
      ),
    );
    expect(d.state).toBe("unknown");
    expect(d.explanation).toMatch(/nothing to compare/i);
  });

  it("scores the share of the posting's terms the CV also names", () => {
    const d = dimension(
      scoreJobMatch(
        candidate({ cvSkills: ["Python", "SQL", "Figma"] }),
        job({ namedSkills: ["Python", "SQL", "Kubernetes", "AWS"] }),
      ),
    );
    expect(d.state).toBe("scored");
    expect(d.score).toBeCloseTo(0.5);
    expect(d.explanation).toContain("Python");
    // The claim is co-occurrence, never that a requirement is met.
    expect(d.explanation).toMatch(/both name/i);
    expect(d.explanation).not.toMatch(/qualif|requirement|suitab/i);
  });

  it("scores zero, not unknown, when a readable CV shares nothing", () => {
    // This is a real comparison that came back empty, which is different from
    // having nothing to compare.
    const d = dimension(
      scoreJobMatch(
        candidate({ cvSkills: ["Figma"] }),
        job({ namedSkills: ["Python", "SQL"] }),
      ),
    );
    expect(d.state).toBe("scored");
    expect(d.score).toBe(0);
  });

  it("does not distort the other dimensions when it is unknown", () => {
    // An unknown dimension drops out of the weighting entirely, so a perfect
    // match on everything else still scores 100.
    const result = scoreJobMatch(candidate(), job());
    expect(dimension(result).state).toBe("unknown");
    expect(result.score).toBe(100);
  });
});
