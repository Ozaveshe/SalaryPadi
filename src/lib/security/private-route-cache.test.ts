import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";
import {
  PROTECTED_NO_STORE_SOURCES,
  PROTECTED_PAGE_PREFIXES,
} from "@/lib/security/protected-paths";

async function sourcesWithHeader(key: string, value?: string) {
  const configured = (await nextConfig.headers?.()) ?? [];
  return configured
    .filter((entry) =>
      entry.headers.some(
        (header) =>
          header.key.toLowerCase() === key &&
          (value === undefined || header.value === value),
      ),
    )
    .map((entry) => entry.source);
}

describe("private route cache policy", () => {
  it("marks every viewer-only page family private and no-store", async () => {
    const protectedSources = await sourcesWithHeader(
      "cache-control",
      "private, no-store",
    );

    // Asserted against the shared list rather than a local copy. This file
    // previously repeated the sources by hand, which is exactly how
    // /dashboard came to be enforced by the proxy but served without a
    // no-store directive.
    expect(protectedSources).toEqual(
      expect.arrayContaining([...PROTECTED_NO_STORE_SOURCES]),
    );
  });

  it("covers every path the request proxy protects", async () => {
    const protectedSources = await sourcesWithHeader(
      "cache-control",
      "private, no-store",
    );
    for (const prefix of PROTECTED_PAGE_PREFIXES) {
      expect(protectedSources, prefix).toContain(`${prefix}/:path*`);
    }
  });
});

describe("transport security", () => {
  it("sends HSTS from production builds only", async () => {
    const sources = await sourcesWithHeader("strict-transport-security");
    if (process.env.NODE_ENV === "production") {
      expect(sources).toContain("/:path*");
    } else {
      // A loopback dev server must never pin localhost to HTTPS for every
      // other project on the machine.
      expect(sources).toHaveLength(0);
    }
  });
});
