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
  if (
    repositoryPath === "src/lib/http/form.ts" &&
    consumer === ".formData()" &&
    source.includes("await readBoundedBody(request, maximumBytes)") &&
    source.includes("new Response(bytes.buffer")
  ) {
    return true;
  }

  /*
   * The CV upload buffers a file, not a remote response. It is bounded twice
   * over before it is read: the whole multipart body already came through
   * `readApiForm` with a byte limit, and the part's own declared size is
   * rejected above `MAX_CV_BYTES` before `arrayBuffer()` is reached. Both
   * conditions are asserted here so removing either one fails this guard.
   */
  return (
    repositoryPath === "src/app/api/career/cv/route.ts" &&
    consumer === ".arrayBuffer()" &&
    source.includes("await readApiForm(request, MAX_REQUEST_BYTES") &&
    source.includes("if (file.size > MAX_CV_BYTES) return back(")
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
