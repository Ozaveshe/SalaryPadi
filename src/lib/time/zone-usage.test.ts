import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Nothing may quietly go back to rendering dates in UTC.
 *
 * The timezone was not wrong in one place, it was wrong in six, because every
 * new formatter copied `timeZone: "UTC"` from the one beside it. A grep is the
 * cheapest thing that stops the seventh.
 */

const sourceRoot = join(process.cwd(), "src");

/**
 * Files allowed to reason in UTC, each for a stated reason.
 *
 * The currency repository validates the European Commission's own month
 * label, which is that provider's calendar and not ours.
 *
 * `time/zone.ts` is deliberately absent: it calls `Date.UTC` to build a
 * comparable day index out of already-zoned parts, which is arithmetic rather
 * than a claim about which clock a reader is on.
 */
const REASONED_UTC_USE = new Map([
  [
    "src/lib/currency/repository.ts",
    "validates the rate provider's own month label",
  ],
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

// Epoch-day division (`Math.floor(ts / MS_PER_DAY)`) is UTC day reasoning in
// disguise: it derives a calendar day without naming a zone, which is how the
// deadline drift the WAT migration fixed slipped past the original pattern.
const UTC_REASONING =
  /timeZone:\s*"UTC"|getUTC(?:FullYear|Month|Date)\(|Math\.floor\([^\n]*\/\s*(?:MS_PER_DAY|86_?400_?000)/;

describe("the operating clock is used everywhere", () => {
  it("has no unexplained UTC date reasoning left in src", () => {
    const offenders = sourceFiles(sourceRoot)
      .filter((file) => UTC_REASONING.test(readFileSync(file, "utf8")))
      .map((file) => relative(process.cwd(), file).split(sep).join("/"))
      .filter((path) => !REASONED_UTC_USE.has(path))
      .toSorted();

    expect(offenders).toEqual([]);
  });

  it("keeps the reasoned exceptions honest", () => {
    // An allow-list entry that no longer matches anything is a stale rule, and
    // a stale rule is one somebody will copy the next time they need one.
    for (const path of REASONED_UTC_USE.keys()) {
      const contents = readFileSync(join(process.cwd(), path), "utf8");
      expect(UTC_REASONING.test(contents)).toBe(true);
    }
  });
});
