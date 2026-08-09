import { describe, expect, it } from "vitest";

import {
  ACTIVE_APPLICATION_STATUSES,
  isActiveApplicationStatus,
  isStaleApplication,
  readDeadline,
  STALE_APPLICATION_MS,
} from "./pipeline";

const NOW = Date.parse("2026-07-28T09:30:00.000Z");

describe("live application statuses", () => {
  it("counts only in-flight processes as live", () => {
    for (const status of ACTIVE_APPLICATION_STATUSES) {
      expect(isActiveApplicationStatus(status)).toBe(true);
    }
    for (const status of ["saved", "rejected", "withdrawn"]) {
      expect(isActiveApplicationStatus(status)).toBe(false);
    }
  });

  it("keeps the funnel order the summary reads stages in", () => {
    expect([...ACTIVE_APPLICATION_STATUSES]).toEqual([
      "applied",
      "assessment",
      "interview",
      "offer",
    ]);
  });
});

describe("stalled applications", () => {
  it("reports a record untouched for the full stale window", () => {
    expect(
      isStaleApplication(
        new Date(NOW - STALE_APPLICATION_MS).toISOString(),
        NOW,
      ),
    ).toBe(true);
  });

  it("does not report a record touched inside the window", () => {
    const justInside = new Date(
      NOW - STALE_APPLICATION_MS + 1_000,
    ).toISOString();
    expect(isStaleApplication(justInside, NOW)).toBe(false);
  });

  it("treats a missing or unparseable timestamp as not stalled", () => {
    expect(isStaleApplication(null, NOW)).toBe(false);
    expect(isStaleApplication("not a date", NOW)).toBe(false);
  });
});

describe("reading a self-set next-action date", () => {
  it("describes a date that has passed as overdue by whole days", () => {
    expect(readDeadline("2026-07-25T00:00:00.000Z", NOW)).toEqual({
      dayOffset: -3,
      urgency: "overdue",
      description: "Overdue by 3 days",
    });
  });

  it("uses the singular for a single day overdue", () => {
    expect(readDeadline("2026-07-27T00:00:00.000Z", NOW)?.description).toBe(
      "Overdue by a day",
    );
  });

  it("reads urgency on the same West Africa Time calendar the date renders on", () => {
    // 2026-07-28T00:00Z is 01:00 WAT on the 28th — today.
    expect(readDeadline("2026-07-28T00:00:00.000Z", NOW)).toEqual({
      dayOffset: 0,
      urgency: "today",
      description: "Due today",
    });
    // 2026-07-28T23:59Z is already 00:59 WAT on the 29th. formatDate renders
    // that instant as 29 Jul, so describing it as "Due today" would
    // contradict the date printed beside it — the drift the WAT migration
    // eliminated.
    expect(readDeadline("2026-07-28T23:59:59.000Z", NOW)).toEqual({
      dayOffset: 1,
      urgency: "tomorrow",
      description: "Due tomorrow",
    });
  });

  it("separates tomorrow from the rest of the week", () => {
    expect(readDeadline("2026-07-29T06:00:00.000Z", NOW)).toEqual({
      dayOffset: 1,
      urgency: "tomorrow",
      description: "Due tomorrow",
    });
    expect(readDeadline("2026-07-31T06:00:00.000Z", NOW)).toEqual({
      dayOffset: 3,
      urgency: "upcoming",
      description: "Due in 3 days",
    });
  });

  it("reads an offset timestamp on the displayed calendar, not its own offset", () => {
    // 2026-07-29T00:30+01:00 IS 00:30 WAT on the 29th; formatDate renders it
    // as 29 Jul, so it reads as tomorrow relative to a 28 Jul WAT `now`.
    expect(readDeadline("2026-07-29T00:30:00.000+01:00", NOW)?.urgency).toBe(
      "tomorrow",
    );
  });

  it("returns nothing for an unparseable date rather than inventing an urgency", () => {
    expect(readDeadline("soon", NOW)).toBeNull();
  });
});
