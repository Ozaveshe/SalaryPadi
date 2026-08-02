import { describe, expect, it } from "vitest";

import {
  PRODUCT_SURFACES,
  primaryNavigation,
  surfaceForPath,
} from "./surfaces";

describe("product surfaces", () => {
  it("keeps the header to four surfaces", () => {
    const navigation = primaryNavigation();
    expect(navigation.map((item) => item.label)).toEqual([
      "Jobs",
      "Companies",
      "Pay & Offers",
      "My Career",
    ]);
  });

  it("gives every surface a consumer-language summary", () => {
    for (const surface of PRODUCT_SURFACES) {
      expect(surface.summary.length).toBeGreaterThan(20);
      // Ingestion and engineering vocabulary must never reach navigation copy.
      expect(surface.summary.toLowerCase()).not.toMatch(
        /ingest|adapter|provenance|canonical|source_|feed|rpc/,
      );
    }
  });

  it("never lists the same destination under two surfaces", () => {
    const seen = new Map<string, string>();
    for (const surface of PRODUCT_SURFACES) {
      for (const link of surface.links) {
        const existing = seen.get(link.href);
        expect(
          existing,
          `${link.href} is listed under both ${existing} and ${surface.id}`,
        ).toBeUndefined();
        seen.set(link.href, surface.id);
      }
    }
  });

  it("routes every navigable path to exactly one surface", () => {
    expect(surfaceForPath("/jobs")).toBe("jobs");
    expect(surfaceForPath("/jobs/remote")).toBe("jobs");
    expect(surfaceForPath("/jobs/some-role-slug")).toBe("jobs");
    expect(surfaceForPath("/matches")).toBe("jobs");
    expect(surfaceForPath("/companies/moniepoint")).toBe("companies");
    expect(surfaceForPath("/companies/moniepoint/salaries")).toBe("companies");
    expect(surfaceForPath("/salaries")).toBe("pay");
    expect(surfaceForPath("/salaries/ng/sales")).toBe("pay");
    expect(surfaceForPath("/tools/take-home-pay")).toBe("pay");
    expect(surfaceForPath("/saved")).toBe("career");
    expect(surfaceForPath("/applications")).toBe("career");
    expect(surfaceForPath("/contribute/salary")).toBe("career");
  });

  it("does not claim marketing and policy routes for a surface", () => {
    for (const path of ["/about", "/privacy", "/terms", "/for-employers"]) {
      expect(surfaceForPath(path)).toBeNull();
    }
  });

  it("keeps browsing available without an account", () => {
    const jobs = PRODUCT_SURFACES.find((surface) => surface.id === "jobs");
    const pay = PRODUCT_SURFACES.find((surface) => surface.id === "pay");
    expect(
      jobs?.links.filter((link) => !link.requiresAccount).length,
    ).toBeGreaterThan(3);
    // Every pay tool is usable signed-out; only persistence needs an account.
    expect(pay?.links.every((link) => !link.requiresAccount)).toBe(true);
  });
});
