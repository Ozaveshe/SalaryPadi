import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

describe("Netlify Blob runtime compatibility", () => {
  it("loads the unmocked ESM entrypoint used by .mts functions", async () => {
    const blobModule = await import("@netlify/blobs");
    expect(blobModule.getStore).toBeTypeOf("function");
  });

  it("loads the unmocked CommonJS entrypoint without an ESM require error", () => {
    const require = createRequire(import.meta.url);
    expect(() => {
      const blobModule = require("@netlify/blobs") as {
        getStore?: unknown;
      };
      expect(blobModule.getStore).toBeTypeOf("function");
    }).not.toThrow();
  });
});
