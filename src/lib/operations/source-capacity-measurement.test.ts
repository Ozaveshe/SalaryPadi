import { describe, expect, it } from "vitest";

import {
  EXIT_CODES,
  classifySource,
  observedDailyRate,
  registrationSql,
  runCli,
  selectMeasurement,
  summarize,
} from "../../../scripts/measure-source-capacity.mjs";

const target = { target_daily_new_canonical: 500, pilot_days: 14 };

function row(overrides: Record<string, unknown> = {}) {
  return {
    adapter_key: "example_workable",
    recorded_expected: null,
    recorded_evidence: null,
    backfill_day: "2026-07-01",
    observation_days: 20,
    total_count: 180,
    with_posted_at: 180,
    backfill_count: 140,
    new_by_day: 40,
    new_by_posted_at: 40,
    ...overrides,
  };
}

describe("observedDailyRate", () => {
  it("floors so a partial posting never rounds up into credited capacity", () => {
    expect(observedDailyRate(40, 20)).toBe(2);
    expect(observedDailyRate(29, 20)).toBe(1);
    expect(observedDailyRate(19, 20)).toBe(0);
  });

  it("rejects a non-positive observation window", () => {
    expect(() => observedDailyRate(10, 0)).toThrow();
    expect(() => observedDailyRate(-1, 10)).toThrow();
  });
});

describe("selectMeasurement", () => {
  it("prefers posting dates when the source reports them for every job", () => {
    expect(
      selectMeasurement(row({ new_by_posted_at: 5, new_by_day: 60 })),
    ).toEqual({ method: "posted_at", steady_state_count: 5 });
  });

  it("falls back to ingestion day when the source has no posting dates", () => {
    expect(
      selectMeasurement(
        row({ with_posted_at: 0, new_by_posted_at: 0, new_by_day: 60 }),
      ),
    ).toEqual({ method: "observed_day", steady_state_count: 60 });
  });

  // moniepoint_greenhouse ingested 22 pre-existing roles on 7/21 and another 49
  // on 7/22. Reading only the ingestion day credits those 49 as new supply.
  it("does not credit a backfill that spilled into a second day", () => {
    const measured = selectMeasurement(
      row({ backfill_count: 22, new_by_day: 49, new_by_posted_at: 0 }),
    );
    expect(measured.method).toBe("posted_at");
    expect(measured.steady_state_count).toBe(0);
  });
});

describe("classifySource", () => {
  it("excludes the first-fetch backfill from the measured rate", () => {
    const classified = classifySource(row(), 14);
    expect(classified.qualifies).toBe(true);
    expect(classified.observed_daily).toBe(2);
  });

  it("credits nothing to a source short of its pilot window", () => {
    const classified = classifySource(row({ observation_days: 1 }), 14);
    expect(classified.qualifies).toBe(false);
    expect(classified.observed_daily).toBeNull();
    expect(classified.reason).toContain("1d of 14d");
  });

  it("measures a board that backfilled but has posted nothing since as zero", () => {
    const classified = classifySource(
      row({
        backfill_count: 206,
        new_by_day: 0,
        new_by_posted_at: 0,
        observation_days: 30,
      }),
      14,
    );
    expect(classified.qualifies).toBe(true);
    expect(classified.observed_daily).toBe(0);
  });

  it("names the fallback method when a source has no posting dates", () => {
    const classified = classifySource(
      row({ with_posted_at: 0, new_by_day: 40, new_by_posted_at: 0 }),
      14,
    );
    expect(classified.method).toBe("observed_day");
    expect(classified.reason).toContain("no posting dates");
  });
});

describe("summarize", () => {
  it("sums only sources that completed the pilot window", () => {
    const summary = summarize(
      [
        row({ adapter_key: "a" }),
        row({
          adapter_key: "b",
          new_by_posted_at: 900,
          new_by_day: 900,
          observation_days: 2,
        }),
      ],
      target,
    );
    expect(summary.qualifying).toHaveLength(1);
    expect(summary.creditable_daily_capacity).toBe(2);
  });
});

describe("registrationSql", () => {
  it("records the measured rate with an evidence ref naming the window", () => {
    const summary = summarize([row()], target);
    const sql = registrationSql(summary.qualifying, "2026-08-15", target);
    expect(sql).toContain("expected_daily_new_canonical = 2");
    expect(sql).toContain(
      "'measured:2026-08-15:example_workable:40-new-over-20d'",
    );
    expect(sql).toContain("-- Credited capacity from this file: 2/day.");
  });

  it("escapes quotes in an adapter key", () => {
    const summary = summarize(
      [row({ adapter_key: "o'brien_workable" })],
      target,
    );
    const sql = registrationSql(summary.qualifying, "2026-08-15", target);
    expect(sql).toContain("'o''brien_workable'");
  });

  it("refuses to emit a file crediting nothing", () => {
    expect(() => registrationSql([], "2026-08-15", target)).toThrow();
  });
});

describe("runCli", () => {
  it("reports capacity_unproven as truthful when no window has completed", async () => {
    const lines: string[] = [];
    const exitCode = await runCli({
      environment: { SALARYPADI_DB_URL: "postgres://example" },
      argv: [],
      write: (line: string) => lines.push(line),
      writeError: (line: string) => lines.push(line),
      read: async () => ({
        target,
        counts: { runnable: 108, with_evidence: 0 },
        measured: [
          row({ observation_days: 1, new_by_day: 0, new_by_posted_at: 0 }),
        ],
      }),
    });
    expect(exitCode).toBe(EXIT_CODES.no_qualifying_sources);
    expect(lines.join("\n")).toContain("truthful state");
  });

  it("requires a database url", async () => {
    const errors: string[] = [];
    const exitCode = await runCli({
      environment: {},
      argv: [],
      write: () => {},
      writeError: (line: string) => errors.push(line),
      read: async () => {
        throw new Error("must not connect");
      },
    });
    expect(exitCode).toBe(EXIT_CODES.usage);
    expect(errors.join("\n")).toContain("SALARYPADI_DB_URL");
  });
});
