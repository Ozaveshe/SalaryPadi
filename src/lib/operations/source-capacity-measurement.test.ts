import { describe, expect, it } from "vitest";

import {
  EXIT_CODES,
  classifySource,
  observedDailyRate,
  registrationSql,
  runCli,
  summarize,
} from "../../../scripts/measure-source-capacity.mjs";

const target = { target_daily_new_canonical: 500, pilot_days: 14 };

function row(overrides: Record<string, unknown> = {}) {
  return {
    adapter_key: "example_greenhouse",
    recorded_expected: null,
    recorded_evidence: null,
    backfill_day: "2026-07-01",
    observation_days: 20,
    backfill_count: 140,
    steady_state_count: 40,
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

describe("classifySource", () => {
  // The failure this whole script exists to prevent: a board's first fetch
  // backfills every role it already had open. Crediting that spike as a daily
  // rate overstates capacity by one to two orders of magnitude.
  it("excludes the first-fetch backfill from the measured rate", () => {
    const classified = classifySource(
      row({
        backfill_count: 140,
        steady_state_count: 40,
        observation_days: 20,
      }),
      14,
    );
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
      row({ backfill_count: 206, steady_state_count: 0, observation_days: 30 }),
      14,
    );
    expect(classified.qualifies).toBe(true);
    expect(classified.observed_daily).toBe(0);
  });
});

describe("summarize", () => {
  it("sums only sources that completed the pilot window", () => {
    const summary = summarize(
      [
        row({ adapter_key: "a", steady_state_count: 40, observation_days: 20 }),
        row({ adapter_key: "b", steady_state_count: 900, observation_days: 2 }),
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
      "'measured:2026-08-15:example_greenhouse:40-new-over-20d'",
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
        measured: [row({ observation_days: 1, steady_state_count: 0 })],
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
