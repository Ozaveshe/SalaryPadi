import { describe, expect, it } from "vitest";

import { firstSearchParam, sliceSearchParam } from "@/lib/search-params";

describe("search parameter normalization", () => {
  it("accepts only the first scalar representation", () => {
    expect(firstSearchParam("ready")).toBe("ready");
    expect(firstSearchParam(["ready", "forged"])).toBe("");
    expect(firstSearchParam(undefined)).toBe("");
  });

  it("bounds scalar values and applies fallbacks only to absent scalars", () => {
    expect(sliceSearchParam("Nigeria", 2, "NG")).toBe("Ni");
    expect(sliceSearchParam("", 2, "NG")).toBe("");
    expect(sliceSearchParam(undefined, 2, "NG")).toBe("NG");
    expect(sliceSearchParam(["GH"], 2, "NG")).toBe("NG");
  });
});
