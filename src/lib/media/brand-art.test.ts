import { describe, expect, it } from "vitest";

import { getBrandArt, getEditorialCover } from "@/lib/media/brand-art";

describe("brand art registry", () => {
  it("renders nothing for a slot whose asset has not shipped", () => {
    expect(getBrandArt("hero-home")).toBeNull();
    expect(getBrandArt("empty-jobs")).toBeNull();
  });

  it("renders nothing for an article cover before any cover ships", () => {
    expect(getEditorialCover("understand-take-home-pay-nigeria")).toBeNull();
  });

  it("keeps every served path inside the art directory", () => {
    const paths = [
      getBrandArt("about"),
      getEditorialCover("compare-two-job-offers"),
    ]
      .filter((art) => art !== null)
      .map((art) => art.src);
    for (const path of paths) {
      expect(path.startsWith("/art/")).toBe(true);
      expect(path).not.toContain("..");
      expect(path.endsWith(".webp")).toBe(true);
    }
  });
});
