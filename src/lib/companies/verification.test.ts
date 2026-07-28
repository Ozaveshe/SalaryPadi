import { describe, expect, it } from "vitest";

import {
  companyVerificationLabel,
  companyVerificationTone,
} from "@/lib/companies/verification";

describe("company verification presentation", () => {
  it("gives a verified employer the success tone", () => {
    expect(companyVerificationTone("employer_verified")).toBe("success");
  });

  it("keeps a source listing neutral rather than implying verification", () => {
    expect(companyVerificationTone("source_listed")).toBe("neutral");
    expect(companyVerificationLabel("source_listed")).toBe("Source listed");
  });

  it("warns only when nothing has been verified", () => {
    expect(companyVerificationTone("unverified")).toBe("warning");
  });

  it("never reuses one tone for every state", () => {
    const tones = new Set(
      (["employer_verified", "source_listed", "unverified"] as const).map(
        companyVerificationTone,
      ),
    );
    expect(tones.size).toBe(3);
  });
});
