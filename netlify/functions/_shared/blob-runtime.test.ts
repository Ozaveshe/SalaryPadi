import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

describe("Netlify Blob runtime compatibility", () => {
  it("loads the unmocked ESM entrypoint used by .mts functions", async () => {
    const blobModule = await import("@netlify/blobs");
    expect(blobModule.getStore).toBeTypeOf("function");
  });

  it("loads the unmocked CommonJS entrypoint without an ESM require error", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [
          "-e",
          'const { getStore } = require("@netlify/blobs"); if (typeof getStore !== "function") process.exit(1);',
        ],
        { cwd: process.cwd(), stdio: "pipe" },
      ),
    ).not.toThrow();
  });
});
