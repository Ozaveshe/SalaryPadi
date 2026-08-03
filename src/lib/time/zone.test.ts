import { describe, expect, it } from "vitest";

import {
  SALARYPADI_TIME_ZONE,
  SALARYPADI_TIME_ZONE_LABEL,
  currentZonedYear,
  zonedDayIndex,
  zonedDaysBetween,
} from "./zone";

describe("the operating clock", () => {
  it("runs on West Africa Time", () => {
    expect(SALARYPADI_TIME_ZONE).toBe("Africa/Lagos");
    expect(SALARYPADI_TIME_ZONE_LABEL).toBe("WAT");
  });

  it("puts a late-evening UTC instant on the next Lagos date", () => {
    // 23:30 UTC is 00:30 the following day in Lagos. This is the hour where
    // rendering in UTC told a reader "yesterday" about something happening now.
    const instant = new Date("2026-08-03T23:30:00.000Z");
    expect(zonedDayIndex(instant)).toBe(zonedDayIndex(instant, "UTC") + 1);
  });

  it("agrees with UTC during the working day", () => {
    const instant = new Date("2026-08-03T09:00:00.000Z");
    expect(zonedDayIndex(instant)).toBe(zonedDayIndex(instant, "UTC"));
  });

  it("counts whole calendar days, not elapsed hours", () => {
    // 23 hours apart, but two different dates in Lagos.
    expect(
      zonedDaysBetween(
        new Date("2026-08-03T10:00:00.000Z"),
        new Date("2026-08-04T09:00:00.000Z"),
      ),
    ).toBe(1);
    // 23 hours apart and the same Lagos date.
    expect(
      zonedDaysBetween(
        new Date("2026-08-03T00:00:00.000Z"),
        new Date("2026-08-03T22:59:00.000Z"),
      ),
    ).toBe(0);
  });

  it("reads a year on the Lagos clock", () => {
    // 23:30 UTC on new year's eve is already the new year in Lagos, which is
    // what a footer copyright line should say to a reader in Lagos.
    expect(currentZonedYear(new Date("2026-12-31T23:30:00.000Z"))).toBe(2027);
  });

  it("refuses to invent a day for an unreadable instant", () => {
    expect(Number.isNaN(zonedDayIndex(new Date("not a date")))).toBe(true);
  });

  it("honours an explicit zone for country-scoped callers", () => {
    // Accra is an hour behind Lagos, so the same instant can fall on
    // different dates in the two packs.
    const instant = new Date("2026-08-03T00:30:00.000Z");
    expect(zonedDayIndex(instant, "Africa/Lagos")).toBe(
      zonedDayIndex(instant, "Africa/Accra"),
    );
    const midnight = new Date("2026-08-02T23:30:00.000Z");
    expect(zonedDayIndex(midnight, "Africa/Lagos")).toBe(
      zonedDayIndex(midnight, "Africa/Accra") + 1,
    );
  });
});
