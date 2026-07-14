import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");
const sourceExtensions = new Set([".ts", ".tsx"]);
const clientDirective = /^\s*["']use client["'];/;
const environmentImport = /from\s+["'][^"']*(?:@\/)?lib\/env["']/;

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionFiles(path);
    if (
      !sourceExtensions.has(extname(entry.name)) ||
      entry.name.includes(".test.") ||
      entry.name.includes(".spec.")
    ) {
      return [];
    }
    return [path];
  });
}

describe("environment module boundary", () => {
  it("keeps the server environment module out of client dependency roots", () => {
    const violations = productionFiles(sourceRoot).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      if (!clientDirective.test(source) || !environmentImport.test(source)) {
        return [];
      }
      return [relative(process.cwd(), file).replaceAll("\\", "/")];
    });

    expect(
      violations,
      "Client modules must not import @/lib/env; pass public values from a server component or use a narrowly scoped public-only module.",
    ).toEqual([]);
  });
});
