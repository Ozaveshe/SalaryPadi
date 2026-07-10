import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "@/lib/env";

describe("server environment", () => {
  it("uses a loopback default only outside production", () => {
    expect(
      parseServerEnvironment({ NODE_ENV: "development" }).NEXT_PUBLIC_APP_URL,
    ).toBe("http://localhost:3000");
  });

  it("requires an explicit canonical origin in production", () => {
    expect(() => parseServerEnvironment({ NODE_ENV: "production" })).toThrow(
      /explicitly configured/,
    );
  });

  it.each(["http://salarypadi.test", "https://localhost:3000"])(
    "rejects an unsafe production origin: %s",
    (NEXT_PUBLIC_APP_URL) => {
      expect(() =>
        parseServerEnvironment({
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_URL,
        }),
      ).toThrow(/HTTPS and a non-loopback host/);
    },
  );

  it("accepts an explicit HTTPS production origin", () => {
    expect(
      parseServerEnvironment({
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://salarypadi.test",
      }).NEXT_PUBLIC_APP_URL,
    ).toBe("https://salarypadi.test");
  });
});
