import { describe, expect, it } from "vitest";

import {
  JOB_POSTING_AGING_DAYS,
  JOB_POSTING_STALE_DAYS,
  JOB_POSTING_WITHDRAWAL_DAYS,
  isJobWithdrawnForAge,
  jobPostingAge,
  jobPostingAgeDays,
} from "./posting-age";
import type { Job } from "./types";

const now = new Date("2026-07-26T12:00:00.000Z");
const DAY_MS = 86_400_000;

function jobPostedDaysAgo(days: number): Job {
  return {
    postedAt: new Date(now.valueOf() - days * DAY_MS).toISOString(),
  } as Job;
}

describe("job posting age", () => {
  it("measures whole days from the recorded posting date", () => {
    expect(jobPostingAgeDays(jobPostedDaysAgo(0), now)).toBe(0);
    expect(jobPostingAgeDays(jobPostedDaysAgo(29), now)).toBe(29);
    expect(jobPostingAgeDays(jobPostedDaysAgo(520), now)).toBe(520);
  });

  it("reports no age evidence rather than a fabricated zero", () => {
    expect(
      jobPostingAgeDays({ postedAt: "not-a-date" } as Job, now),
    ).toBeNull();
    expect(jobPostingAge({ postedAt: "not-a-date" } as Job, now)).toEqual({
      stage: "current",
      ageDays: null,
      label: null,
      note: null,
    });
  });

  it.each([
    [0, "current"],
    [JOB_POSTING_AGING_DAYS - 1, "current"],
    [JOB_POSTING_AGING_DAYS, "aging"],
    [JOB_POSTING_STALE_DAYS - 1, "aging"],
    [JOB_POSTING_STALE_DAYS, "stale"],
    [JOB_POSTING_WITHDRAWAL_DAYS - 1, "stale"],
    [JOB_POSTING_WITHDRAWAL_DAYS, "withdrawn"],
    [520, "withdrawn"],
  ])("stages a %i-day-old posting as %s", (days, stage) => {
    expect(jobPostingAge(jobPostedDaysAgo(days), now).stage).toBe(stage);
  });

  it("leaves a current role undecorated", () => {
    const age = jobPostingAge(jobPostedDaysAgo(20), now);
    expect(age.label).toBeNull();
    expect(age.note).toBeNull();
  });

  it("labels a decayed role with what the source evidence supports", () => {
    const aging = jobPostingAge(jobPostedDaysAgo(120), now);
    expect(aging.label).toBe("Posted over 3 months ago");
    expect(aging.note).toContain("The source still carries this posting");
    expect(aging.note).toContain("more than 3 months old");

    const stale = jobPostingAge(jobPostedDaysAgo(200), now);
    expect(stale.label).toBe("Posted over 6 months ago");
    expect(stale.note).toContain("more than 6 months old");
  });

  it("never claims the vacancy is filled or closed", () => {
    for (const days of [120, 200, 400]) {
      const note = jobPostingAge(jobPostedDaysAgo(days), now).note ?? "";
      expect(note).not.toMatch(/\b(?:filled|closed|expired)\b/i);
    }
  });

  it("withdraws only past the one-year bound", () => {
    expect(
      isJobWithdrawnForAge(
        jobPostedDaysAgo(JOB_POSTING_WITHDRAWAL_DAYS - 1),
        now,
      ),
    ).toBe(false);
    expect(
      isJobWithdrawnForAge(jobPostedDaysAgo(JOB_POSTING_WITHDRAWAL_DAYS), now),
    ).toBe(true);
    expect(isJobWithdrawnForAge({ postedAt: "not-a-date" } as Job, now)).toBe(
      false,
    );
  });
});
