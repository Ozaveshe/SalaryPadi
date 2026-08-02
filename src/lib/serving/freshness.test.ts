import { describe, expect, it } from "vitest";

import {
  OPERATIONAL_VOCABULARY,
  classifyFreshness,
  formatVerifiedAt,
  toPublicStatus,
  type FreshnessInput,
} from "./freshness";

const MINUTE = 60_000;

function input(overrides: Partial<FreshnessInput> = {}): FreshnessInput {
  return {
    readSucceeded: true,
    recordCount: 42,
    verifiedAt: new Date(Date.now() - 5 * MINUTE).toISOString(),
    delayedSourceCount: 0,
    totalSourceCount: 5,
    freshnessTargetMs: 6 * 60 * MINUTE,
    ...overrides,
  };
}

describe("freshness classification", () => {
  it("reports current when everything is up to date", () => {
    const verdict = classifyFreshness(input());
    expect(verdict.state).toBe("current");
    expect(verdict.showsRecords).toBe(true);
    expect(verdict.message).toMatch(/^Updated \d/);
  });

  it("keeps serving verified jobs when one source is delayed", () => {
    const verdict = classifyFreshness(input({ delayedSourceCount: 1 }));
    expect(verdict.state).toBe("partial");
    expect(verdict.showsRecords).toBe(true);
    expect(verdict.message).toContain("latest verified snapshot");
  });

  it("still serves records when several sources are delayed", () => {
    const verdict = classifyFreshness(
      input({ delayedSourceCount: 3, totalSourceCount: 5 }),
    );
    expect(verdict.state).toBe("partial");
    expect(verdict.showsRecords).toBe(true);
  });

  it("marks an old snapshot stale but keeps showing it", () => {
    const verdict = classifyFreshness(
      input({
        verifiedAt: new Date(Date.now() - 48 * 60 * MINUTE).toISOString(),
      }),
    );
    expect(verdict.state).toBe("stale");
    expect(verdict.showsRecords).toBe(true);
  });

  it("never converts a failed read into a confirmed-empty result", () => {
    // The failure that this whole module exists to prevent.
    const verdict = classifyFreshness(
      input({ readSucceeded: false, recordCount: 0 }),
    );
    expect(verdict.state).toBe("unavailable");
    expect(verdict.state).not.toBe("confirmed_empty");
    expect(verdict.message).toContain("does not mean there are no jobs");
  });

  it("never claims emptiness while a source is delayed", () => {
    const verdict = classifyFreshness(
      input({ recordCount: 0, delayedSourceCount: 1 }),
    );
    expect(verdict.state).toBe("partial");
    expect(verdict.message).not.toMatch(/no jobs match/i);
  });

  it("does claim emptiness when a complete read genuinely matched nothing", () => {
    const verdict = classifyFreshness(
      input({ recordCount: 0, delayedSourceCount: 0 }),
    );
    expect(verdict.state).toBe("confirmed_empty");
    expect(verdict.message).toContain("No jobs match");
  });

  it("treats a missing verified timestamp as unproven, not current", () => {
    expect(classifyFreshness(input({ verifiedAt: null })).state).toBe(
      "unavailable",
    );
  });

  it("recovers to current once a delayed source returns", () => {
    const delayed = classifyFreshness(input({ delayedSourceCount: 2 }));
    const recovered = classifyFreshness(input({ delayedSourceCount: 0 }));
    expect(delayed.state).toBe("partial");
    expect(recovered.state).toBe("current");
  });
});

describe("public messaging", () => {
  it("formats the verified time the way the product speaks", () => {
    const formatted = formatVerifiedAt("2026-08-02T13:20:00Z");
    expect(formatted).toMatch(/2 August at \d{2}:\d{2}/);
  });

  it("survives an unparseable timestamp without throwing", () => {
    expect(formatVerifiedAt("not-a-date")).toBe("an unknown time");
  });

  it("leaks no operational vocabulary in any state", () => {
    const cases: FreshnessInput[] = [
      input(),
      input({ delayedSourceCount: 2 }),
      input({
        verifiedAt: new Date(Date.now() - 99 * 60 * MINUTE).toISOString(),
      }),
      input({ readSucceeded: false, recordCount: 0 }),
      input({ recordCount: 0 }),
      input({ recordCount: 0, delayedSourceCount: 1 }),
      input({ verifiedAt: null }),
    ];
    for (const testCase of cases) {
      const message = classifyFreshness(testCase).message.toLowerCase();
      for (const term of OPERATIONAL_VOCABULARY) {
        expect(
          message.includes(term),
          `"${term}" leaked into: ${message}`,
        ).toBe(false);
      }
    }
  });

  it("never names a source or an error code publicly", () => {
    const verdict = classifyFreshness(input({ delayedSourceCount: 1 }));
    expect(verdict.message).not.toMatch(/[a-z]+_[a-z]+_[a-z]+/);
    // The operator note may carry detail; the public message may not.
    expect(verdict.operatorNote).toContain("sources delayed");
  });
});

describe("public status sanitisation", () => {
  it("reduces internal states to the four public ones", () => {
    const verifiedAt = new Date().toISOString();
    const pairs = [
      [input(), "current"],
      [input({ delayedSourceCount: 1 }), "partial"],
      [
        input({
          verifiedAt: new Date(Date.now() - 99 * 60 * MINUTE).toISOString(),
        }),
        "delayed",
      ],
      [input({ readSucceeded: false, recordCount: 0 }), "unavailable"],
    ] as const;
    for (const [testCase, expected] of pairs) {
      const verdict = classifyFreshness(testCase);
      expect(toPublicStatus(verdict, verifiedAt).state).toBe(expected);
    }
  });

  it("reports a confirmed-empty read as current, not as a fault", () => {
    const verdict = classifyFreshness(input({ recordCount: 0 }));
    expect(toPublicStatus(verdict, null).state).toBe("current");
  });

  it("exposes only the two sanctioned fields", () => {
    const status = toPublicStatus(classifyFreshness(input()), null);
    expect(Object.keys(status).toSorted()).toEqual([
      "lastSuccessfulUpdate",
      "state",
    ]);
  });
});
