import { describe, expect, it } from "vitest";

import { parseSalaryCellProgress, salaryProgressCopy } from "./progress";

const baseRow = {
  role_slug: "data-analysis",
  role_family: "Data Analysis",
  country_code: "NG",
  privacy_threshold: 3,
};

describe("salary progress privacy boundary", () => {
  it("allows an exact zero because it identifies no contributor", () => {
    expect(
      parseSalaryCellProgress({
        ...baseRow,
        displayed_contributions: 0,
        progress_status: "none",
      }),
    ).toMatchObject({ displayedContributions: 0, status: "none" });
  });

  it.each([1, 2])(
    "rejects the exact sub-threshold count %i even if its status looks safe",
    (displayedContributions) => {
      expect(
        parseSalaryCellProgress({
          ...baseRow,
          displayed_contributions: displayedContributions,
          progress_status: "fewer_than_threshold",
        }),
      ).toBeNull();
    },
  );

  it("accepts only a null display for the sub-threshold bucket", () => {
    const progress = parseSalaryCellProgress({
      ...baseRow,
      displayed_contributions: null,
      progress_status: "fewer_than_threshold",
    });
    expect(progress).not.toBeNull();
    expect(salaryProgressCopy(progress!)).toEqual({
      heading: "Fewer than 3 approved contributions available",
      detail:
        "The exact sub-threshold count stays private. Company-level progress is never exposed.",
    });
  });

  it("caps a met cell at its configured threshold", () => {
    expect(
      parseSalaryCellProgress({
        ...baseRow,
        privacy_threshold: 4,
        displayed_contributions: 4,
        progress_status: "threshold_met",
      }),
    ).toMatchObject({ displayedContributions: 4, privacyThreshold: 4 });
    expect(
      parseSalaryCellProgress({
        ...baseRow,
        displayed_contributions: 7,
        progress_status: "threshold_met",
      }),
    ).toBeNull();
  });

  it.each([
    { country_code: "ng" },
    { role_slug: "Data Analysis" },
    { privacy_threshold: 2 },
    { progress_status: "one" },
  ])("fails closed for malformed public fields: %o", (override) => {
    expect(
      parseSalaryCellProgress({
        ...baseRow,
        displayed_contributions: null,
        progress_status: "fewer_than_threshold",
        ...override,
      }),
    ).toBeNull();
  });
});
