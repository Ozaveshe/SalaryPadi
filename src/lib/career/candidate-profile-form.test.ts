import { describe, expect, it } from "vitest";

import {
  candidateProfileFormSchema,
  toCandidateProfilePayload,
} from "./candidate-profile-form";

function formEntries(overrides: Record<string, string> = {}) {
  return {
    headline: "Backend engineer",
    summary: "",
    years_experience: "6",
    experience_level: "mid",
    desired_work_arrangement: "remote",
    desired_salary_min: "400000",
    desired_salary_max: "600000",
    desired_currency_code: "NGN",
    desired_pay_period: "monthly",
    location_country: "NG",
    ...overrides,
  };
}

function parse(overrides: Record<string, string> = {}) {
  return candidateProfileFormSchema.safeParse(formEntries(overrides));
}

describe("candidateProfileFormSchema", () => {
  it("accepts a fully completed form", () => {
    expect(parse().success).toBe(true);
  });

  it("accepts an entirely empty profile", () => {
    const result = candidateProfileFormSchema.safeParse({
      headline: "",
      summary: "",
      years_experience: "",
      experience_level: "unspecified",
      desired_work_arrangement: "unspecified",
      desired_salary_min: "",
      desired_salary_max: "",
      desired_currency_code: "",
      desired_pay_period: "",
      location_country: "",
    });

    expect(result.success).toBe(true);
  });

  describe("mirrors the database's truth rules", () => {
    it("rejects a pay amount with no currency", () => {
      expect(parse({ desired_currency_code: "" }).success).toBe(false);
    });

    it("rejects a pay amount with no pay period", () => {
      expect(parse({ desired_pay_period: "" }).success).toBe(false);
    });

    it("rejects an inverted pay range", () => {
      expect(
        parse({ desired_salary_min: "900000", desired_salary_max: "100000" })
          .success,
      ).toBe(false);
    });

    it("allows a currency and period with no amount", () => {
      expect(
        parse({ desired_salary_min: "", desired_salary_max: "" }).success,
      ).toBe(true);
    });
  });

  describe("field validation", () => {
    it("rejects a malformed country code", () => {
      expect(parse({ location_country: "nigeria" }).success).toBe(false);
    });

    it("rejects a malformed currency code", () => {
      expect(parse({ desired_currency_code: "naira" }).success).toBe(false);
    });

    it("rejects an unknown experience level", () => {
      expect(parse({ experience_level: "wizard" }).success).toBe(false);
    });

    it("rejects a non-numeric pay amount", () => {
      expect(parse({ desired_salary_min: "a lot" }).success).toBe(false);
    });

    it("rejects more than 60 years of experience", () => {
      expect(parse({ years_experience: "99" }).success).toBe(false);
    });

    it("rejects a one-character headline", () => {
      expect(parse({ headline: "x" }).success).toBe(false);
    });

    it("upper-cases a lowercase country and currency", () => {
      const result = parse({
        location_country: "ng",
        desired_currency_code: "ngn",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.location_country).toBe("NG");
        expect(result.data.desired_currency_code).toBe("NGN");
      }
    });
  });
});

describe("toCandidateProfilePayload", () => {
  it("omits absent claims rather than sending empty strings", () => {
    const result = candidateProfileFormSchema.safeParse({
      headline: "",
      summary: "",
      years_experience: "",
      experience_level: "unspecified",
      desired_work_arrangement: "unspecified",
      desired_salary_min: "",
      desired_salary_max: "",
      desired_currency_code: "",
      desired_pay_period: "",
      location_country: "",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const payload = toCandidateProfilePayload(result.data);

    expect(payload.headline).toBeUndefined();
    expect(payload.location_country).toBeUndefined();
    expect(payload.desired_salary_min).toBeUndefined();
    expect(payload.open_to_relocation).toBe(false);
  });

  it("converts amounts to numbers", () => {
    const result = parse();
    expect(result.success).toBe(true);
    if (!result.success) return;

    const payload = toCandidateProfilePayload(result.data);

    expect(payload.desired_salary_min).toBe(400_000);
    expect(payload.desired_salary_max).toBe(600_000);
    expect(payload.years_experience).toBe(6);
  });

  it("treats a checked relocation box as true", () => {
    const result = candidateProfileFormSchema.safeParse(
      formEntries({ open_to_relocation: "on" }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(toCandidateProfilePayload(result.data).open_to_relocation).toBe(
      true,
    );
  });
});
