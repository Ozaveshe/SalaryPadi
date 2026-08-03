import { describe, expect, it } from "vitest";

import {
  explainRanking,
  freshnessScore,
  rankJobs,
  scoreJob,
  type RankableJob,
} from "./ranking";

function job(overrides: Partial<RankableJob> = {}): RankableJob {
  return {
    id: "job-1",
    employerKey: "moniepoint",
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

describe("ranking signals", () => {
  it("does not rank primarily by date", () => {
    // The behaviour this module replaces: newest wins inside a bucket.
    const newestButWeak = job({
      id: "new-weak",
      daysSincePosted: 0,
      hoursSinceConfirmed: 0,
      eligibility: "unclear",
      applyLinkState: "unchecked",
      destinationKind: "aggregator",
      sourceAuthority: "secondary_feed",
    });
    const olderButStrong = job({
      id: "old-strong",
      daysSincePosted: 21,
      hoursSinceConfirmed: 6,
      eligibility: "nigeria_explicit",
      salaryDisclosed: true,
      employerVerified: true,
      destinationKind: "direct_employer",
      sourceAuthority: "direct_employer",
    });
    const { organic } = rankJobs([newestButWeak, olderButStrong]);
    expect(organic[0]?.job.id).toBe("old-strong");
  });

  it("ranks an explicitly Nigeria-eligible job above an unclear one", () => {
    const eligible = job({ id: "eligible" });
    const unclear = job({ id: "unclear", eligibility: "unclear" });
    const { organic } = rankJobs([unclear, eligible]);
    expect(organic[0]?.job.id).toBe("eligible");
  });

  it("orders the eligibility ladder as the taxonomy states", () => {
    const states = [
      "nigeria_explicit",
      "africa_explicit",
      "global_remote_reviewed",
      "local_presence_required",
      "unclear",
      "not_eligible",
    ] as const;
    const scores = states.map(
      (eligibility) => scoreJob(job({ eligibility })).components.eligibility,
    );
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeLessThan(scores[i - 1]!);
    }
  });

  it("does not bury unclear jobs entirely", () => {
    // They are real work; a zero would remove them from view in practice.
    expect(
      scoreJob(job({ eligibility: "unclear" })).components.eligibility,
    ).toBeGreaterThan(0);
  });

  it("prefers a direct employer destination over an aggregator", () => {
    const direct = job({ id: "direct", destinationKind: "direct_employer" });
    const aggregator = job({ id: "agg", destinationKind: "aggregator" });
    const { organic } = rankJobs([aggregator, direct]);
    expect(organic[0]?.job.id).toBe("direct");
  });

  it("gives a broken apply link no application quality at all", () => {
    expect(
      scoreJob(job({ applyLinkState: "broken" })).components.applyQuality,
    ).toBe(0);
  });

  it("rewards disclosed salary", () => {
    const disclosed = scoreJob(job({ salaryDisclosed: true })).score;
    const undisclosed = scoreJob(job()).score;
    expect(disclosed).toBeGreaterThan(undisclosed);
  });

  it("treats confirmation separately from posting age", () => {
    // An old posting still listed today beats a recent one nobody rechecked.
    const oldButConfirmed = freshnessScore(40, 2);
    const recentButUnconfirmed = freshnessScore(2, 400);
    expect(oldButConfirmed).toBeGreaterThan(0);
    expect(recentButUnconfirmed).toBeLessThan(freshnessScore(2, 2));
  });

  it("treats unknown age as neither fresh nor stale", () => {
    expect(freshnessScore(null, null)).toBeCloseTo(0.5);
  });

  it("keeps a verified employer from outranking eligibility", () => {
    const verifiedButUnclear = job({
      id: "verified",
      employerVerified: true,
      eligibility: "unclear",
    });
    const plainButEligible = job({ id: "plain" });
    const { organic } = rankJobs([verifiedButUnclear, plainButEligible]);
    expect(organic[0]?.job.id).toBe("plain");
  });

  it("applies opted-in preferences without letting them dominate", () => {
    const preferred = job({ id: "pref", preferenceMatch: 1 });
    const eligiblePlain = job({ id: "plain" });
    expect(scoreJob(preferred).score).toBeGreaterThan(
      scoreJob(eligiblePlain).score,
    );
    // Preference cannot rescue an ineligible job over an eligible one.
    const ineligiblePreferred = job({
      id: "bad",
      eligibility: "not_eligible",
      preferenceMatch: 1,
      textRelevance: 0.4,
    });
    const { organic } = rankJobs([ineligiblePreferred, eligiblePlain]);
    expect(organic[0]?.job.id).toBe("plain");
  });

  it("breaks a score tie on recency, not alphabetically", () => {
    /*
     * Found by A/B against real inventory: SalaryPadi's current jobs are
     * near-homogeneous, so scores tie constantly. Breaking those ties on job
     * id sorted the whole board alphabetically, which is worse for a reader
     * than the newest-first order it replaced.
     */
    const older = job({ id: "aaa-older", daysSincePosted: 9 });
    const newer = job({ id: "zzz-newer", daysSincePosted: 8 });
    const { organic } = rankJobs([older, newer]);
    expect(organic[0]?.job.id).toBe("zzz-newer");
  });

  it("falls back to identity only when recency also ties", () => {
    const a = job({ id: "a", daysSincePosted: 5 });
    const b = job({ id: "b", daysSincePosted: 5 });
    expect(rankJobs([b, a]).organic.map((e) => e.job.id)).toEqual(["a", "b"]);
  });

  it("is deterministic for equally scored jobs", () => {
    const a = job({ id: "a" });
    const b = job({ id: "b" });
    expect(rankJobs([b, a]).organic.map((entry) => entry.job.id)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("sponsored separation", () => {
  it("never mixes a sponsored job into organic results", () => {
    const { organic, sponsored } = rankJobs([
      job({ id: "paid", sponsored: true }),
      job({ id: "organic-1" }),
    ]);
    expect(organic.map((entry) => entry.job.id)).toEqual(["organic-1"]);
    expect(sponsored.map((entry) => entry.job.id)).toEqual(["paid"]);
  });

  it("gives sponsorship no score advantage whatsoever", () => {
    const paid = scoreJob(job({ id: "paid", sponsored: true }));
    const free = scoreJob(job({ id: "free" }));
    expect(paid.score).toBe(free.score);
  });

  it("returns no combined list that could be rendered by accident", () => {
    const result = rankJobs([job({ sponsored: true }), job({ id: "b" })]);
    expect(Object.keys(result).toSorted()).toEqual(["organic", "sponsored"]);
  });
});

describe("explanations", () => {
  it("explains a result in consumer language", () => {
    const ranked = scoreJob(
      job({ salaryDisclosed: true, locationMatch: true }),
    );
    const reasons = explainRanking(ranked);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.join(" ")).not.toMatch(/weight|score|relevance:|\d/);
  });

  it("names eligibility when that is why a job ranks", () => {
    const ranked = scoreJob(job({ textRelevance: 0 }));
    expect(explainRanking(ranked)).toContain("You can apply from Nigeria");
  });

  it("omits components that contributed nothing", () => {
    const ranked = scoreJob(job({ salaryDisclosed: false }));
    expect(explainRanking(ranked, 8)).not.toContain("Salary is disclosed");
  });
});
