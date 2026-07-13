import { describe, expect, it } from "vitest";

import { buildSalaryContributionHref } from "./contribution";

describe("salary contribution links", () => {
  it("prefills only bounded entity context", () => {
    expect(
      buildSalaryContributionHref({
        company: "Acme & Sons",
        role: "Platform Engineer",
        country: "ng",
      }),
    ).toBe(
      "/contribute/salary?company=Acme+%26+Sons&role=Platform+Engineer&country=NG",
    );
  });

  it("drops an invalid country instead of guessing", () => {
    expect(buildSalaryContributionHref({ country: "Nigeria" })).toBe(
      "/contribute/salary",
    );
  });
});
