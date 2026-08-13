import { describe, expect, it } from "vitest";

import { BUNDLED_AFROTOOLS_CATALOG } from "./catalog-fallback";
import {
  groupCareerTools,
  LOCAL_SALARYPADI_TOOLS,
  NATIVE_SCAM_CHECKER,
} from "./tool-presentation";

describe("career tool presentation", () => {
  it("groups the complete journey by career moment", () => {
    const grouped = groupCareerTools(BUNDLED_AFROTOOLS_CATALOG.tools);

    expect(grouped.moments.map(({ id }) => id)).toEqual([
      "prepare",
      "understand_pay",
      "choose",
      "grow",
    ]);
    expect(grouped.moments.map(({ tools }) => tools.length)).toEqual([
      3, 7, 2, 4,
    ]);
    expect(grouped.inside).toHaveLength(5);
    expect(grouped.external).toHaveLength(11);
  });

  it("includes the SalaryPadi scam checker without inventing a provider entry", () => {
    const catalogIdsBefore = BUNDLED_AFROTOOLS_CATALOG.tools.map(
      ({ id }) => id,
    );
    const grouped = groupCareerTools(BUNDLED_AFROTOOLS_CATALOG.tools);
    const native = grouped.inside.find(
      ({ id }) => id === NATIVE_SCAM_CHECKER.id,
    );

    expect(native).toMatchObject({
      catalogId: null,
      source: "salarypadi_native",
      href: "/tools/job-scam-checker",
      disclosure: "Runs in SalaryPadi",
    });
    expect(BUNDLED_AFROTOOLS_CATALOG.tools.map(({ id }) => id)).toEqual(
      catalogIdsBefore,
    );
    expect(catalogIdsBefore).not.toContain(NATIVE_SCAM_CHECKER.id);
  });

  it("keeps supported SalaryPadi tasks local and distinct provider tasks external", () => {
    const grouped = groupCareerTools(BUNDLED_AFROTOOLS_CATALOG.tools);
    const all = grouped.moments.flatMap(({ tools }) => tools);

    expect(all.find(({ id }) => id === "salary-intelligence")).toMatchObject({
      href: "/salaries",
      destination: "salarypadi",
      disclosure: "Runs in SalaryPadi",
    });
    expect(all.find(({ id }) => id === "salary-compare")).toMatchObject({
      href: "https://afrotools.com/tools/salary-compare/",
      destination: "afrotools",
      disclosure: "Opens AfroTools",
    });
    expect(all.find(({ id }) => id === "job-offer-evaluator")?.href).toBe(
      "/tools/offer-compare",
    );
  });

  it("presents every tool as an outcome with an execution disclosure", () => {
    const grouped = groupCareerTools(BUNDLED_AFROTOOLS_CATALOG.tools);
    for (const tool of grouped.moments.flatMap(({ tools }) => tools)) {
      expect(tool.title).not.toMatch(/integration|cache|catalog|timestamp/i);
      expect(tool.description).not.toMatch(
        /integration|cache|catalog|timestamp/i,
      );
      expect(["Runs in SalaryPadi", "Opens AfroTools"]).toContain(
        tool.disclosure,
      );
    }
  });

  it("keeps every local app available when provider destinations fail closed", () => {
    const grouped = groupCareerTools([], { catalogAvailable: false });

    expect(grouped.external).toEqual([]);
    expect(grouped.inside).toEqual([
      NATIVE_SCAM_CHECKER,
      ...LOCAL_SALARYPADI_TOOLS,
    ]);
    expect(grouped.inside).toHaveLength(5);
    expect(grouped.inside.map(({ href }) => href)).toEqual(
      expect.arrayContaining([
        "/tools/job-scam-checker",
        "/tools/take-home-pay",
        "/tools/salary-converter",
        "/tools/offer-compare",
        "/salaries",
      ]),
    );
    expect(grouped.inside.every(({ catalogId }) => catalogId === null)).toBe(
      true,
    );
  });
});
