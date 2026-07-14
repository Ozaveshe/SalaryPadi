import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const roots = [
  join(process.cwd(), "src"),
  join(process.cwd(), "netlify", "functions"),
  join(process.cwd(), "scripts"),
];
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".mjs"]);
const directBodyConsumer =
  /\.(?:json|text|arrayBuffer|blob|bytes|formData)\s*\(\s*\)/g;

function isReviewedBoundedConsumer(
  repositoryPath: string,
  consumer: string,
  source: string,
): boolean {
  return (
    repositoryPath === "src/lib/http/form.ts" &&
    consumer === ".formData()" &&
    source.includes("await readBoundedBody(request, maximumBytes)") &&
    source.includes("new Response(bytes.buffer")
  );
}

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "test-support" ? [] : productionFiles(path);
    }
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

describe("remote response boundaries", () => {
  it("keeps production response bodies on bounded streaming readers", () => {
    const violations = roots.flatMap((root) =>
      productionFiles(root).flatMap((file) => {
        const source = readFileSync(file, "utf8");
        const repositoryPath = relative(process.cwd(), file).replaceAll(
          "\\",
          "/",
        );
        return [...source.matchAll(directBodyConsumer)]
          .map((match) => ({ file, consumer: match[0] }))
          .filter(
            ({ consumer }) =>
              !isReviewedBoundedConsumer(repositoryPath, consumer, source),
          );
      }),
    );

    expect(
      violations,
      "Direct body consumers buffer an untrusted response without a byte limit; use a bounded streaming reader.",
    ).toEqual([]);
  });
});
