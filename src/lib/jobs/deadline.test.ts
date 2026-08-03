import { describe, expect, it } from "vitest";

import { jobDeadlineNotice } from "./deadline";

const now = new Date("2026-08-03T12:00:00.000Z");

describe("job application deadline", () => {
  it("says nothing when the posting states no deadline", () => {
    // Silence is correct here: an invented deadline is worse than none.
    expect(jobDeadlineNotice(null, now)).toEqual({ state: "none" });
    expect(jobDeadlineNotice(undefined, now)).toEqual({ state: "none" });
  });

  it("ignores a value it cannot read rather than guessing", () => {
    expect(jobDeadlineNotice("not a date", now)).toEqual({ state: "none" });
  });

  it("reports a closed application in the past tense", () => {
    const notice = jobDeadlineNotice("2026-08-01T00:00:00.000Z", now);
    expect(notice).toMatchObject({ state: "closed" });
    if (notice.state === "closed") {
      expect(notice.label).toBe("Applications closed on 1 Aug 2026");
    }
  });

  it("counts whole days, not hours", () => {
    // An hour before midnight in Lagos tomorrow still closes tomorrow.
    const notice = jobDeadlineNotice("2026-08-04T22:00:00.000Z", now);
    expect(notice).toMatchObject({ daysRemaining: 1, urgent: true });
    if (notice.state === "open") {
      expect(notice.label).toBe("Applications close tomorrow, 4 Aug 2026");
    }
  });

  it("names today rather than saying zero days", () => {
    const notice = jobDeadlineNotice("2026-08-03T22:59:00.000Z", now);
    expect(notice).toMatchObject({ daysRemaining: 0, urgent: true });
    if (notice.state === "open") {
      expect(notice.label).toContain("close today");
    }
  });

  it("reads the deadline on Lagos time, not UTC", () => {
    /*
     * 23:30 UTC is already tomorrow in Lagos. Counted in UTC this deadline
     * closes today; counted where the reader is, they have another day. Being
     * wrong in that direction tells someone they have missed a deadline they
     * have not.
     */
    const notice = jobDeadlineNotice("2026-08-03T23:30:00.000Z", now);
    expect(notice).toMatchObject({ daysRemaining: 1 });
    if (notice.state === "open") {
      expect(notice.label).toBe("Applications close tomorrow, 4 Aug 2026");
    }
  });

  it("marks a deadline inside a week as urgent and a later one as not", () => {
    expect(jobDeadlineNotice("2026-08-10T00:00:00.000Z", now)).toMatchObject({
      daysRemaining: 7,
      urgent: true,
    });
    expect(jobDeadlineNotice("2026-08-11T00:00:00.000Z", now)).toMatchObject({
      daysRemaining: 8,
      urgent: false,
    });
  });

  it("states a distant deadline as a plain date", () => {
    const notice = jobDeadlineNotice("2026-12-01T00:00:00.000Z", now);
    if (notice.state === "open") {
      expect(notice.label).toBe("Applications close on 1 Dec 2026");
    }
  });
});
