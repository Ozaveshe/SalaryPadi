import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { EXPECTED_WORKER_KEYS } from "./worker-registry";

function scheduledHandlerKeys() {
  const directory = resolve(process.cwd(), "netlify/functions");
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isFile() || !/\.(?:ts|mts)$/.test(entry.name)) return [];
    const source = readFileSync(resolve(directory, entry.name), "utf8");
    if (!/schedule\s*:/.test(source)) return [];
    const match = /runTrackedWorker\(\s*["']([a-z][a-z0-9_]+)["']/.exec(source);
    if (!match?.[1])
      throw new Error(`Scheduled handler ${entry.name} has no task key.`);
    return [match[1]];
  });
}

describe("production worker registry", () => {
  it("covers every scheduled Netlify handler exactly once", () => {
    const handlers = scheduledHandlerKeys();
    expect(new Set(handlers).size).toBe(handlers.length);
    expect([...EXPECTED_WORKER_KEYS].toSorted()).toEqual(handlers.toSorted());
  });
});
