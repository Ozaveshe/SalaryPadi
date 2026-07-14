import { describe, expect, it } from "vitest";

import { analyzeContributionPayload } from "./moderation";

describe("automatic contribution moderation", () => {
  it("flags adversarial categories without returning matched text", () => {
    const malicious =
      "manager@example.com shared a confidential password; this is fraud <script>alert(1)</script> and I will hurt you";
    const flags = analyzeContributionPayload({ narrative: malicious });

    expect(flags).toEqual([
      "confidential_material",
      "malicious_text",
      "pii",
      "serious_allegation",
      "threat",
    ]);
    expect(JSON.stringify(flags)).not.toContain("manager@example.com");
    expect(JSON.stringify(flags)).not.toContain("password");
  });

  it("does not inspect private intake metadata recursively", () => {
    expect(
      analyzeContributionPayload({
        context: "Neutral workplace context",
        _private_identity: "manager@example.com",
      }),
    ).toEqual([]);
  });
});
