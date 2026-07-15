import { describe, expect, it } from "vitest";

import type { Job } from "@/lib/jobs/types";

import {
  toCandidateProfile,
  toJobFacts,
  type CandidateProfileRowLike,
} from "./adapt";
import { scoreJobMatch } from "./score";

function profileRow(
  overrides: Partial<CandidateProfileRowLike> = {},
): CandidateProfileRowLike {
  return {
    experience_level: "mid",
    desired_work_arrangement: "remote",
    desired_salary_min: 400_000,
    desired_salary_max: 600_000,
    desired_currency_code: "NGN",
    desired_pay_period: "monthly",
    location_country: "NG",
    open_to_relocation: false,
    ...overrides,
  };
}

function feedJob(overrides: Partial<Job> = {}): Job {
  return {
    experienceLevel: "mid",
    workMode: "remote",
    salary: {
      originalText: "NGN 400,000 - 600,000 per month",
      currency: "NGN",
      minimum: 400_000,
      maximum: 600_000,
      payPeriod: "monthly",
      grossNet: "gross",
    },
    eligibility: {
      scope: "nigeria",
      nigeria: "eligible",
      africa: "eligible",
      includedCountries: ["NG"],
      excludedCountries: [],
      requiredTimezone: null,
      workAuthorization: null,
      visaSponsorship: "unclear",
      relocationSupport: "unclear",
      evidenceText: "Source states Nigeria eligible.",
      provenance: "source_provided",
      lastVerifiedAt: "2026-07-14T00:00:00.000Z",
    },
    ...overrides,
  } as Job;
}

describe("toCandidateProfile", () => {
  it("maps a fully populated row", () => {
    expect(toCandidateProfile(profileRow())).toEqual({
      experienceLevel: "mid",
      desiredWorkArrangement: "remote",
      desiredSalaryMin: 400_000,
      desiredSalaryMax: 600_000,
      desiredCurrencyCode: "NGN",
      desiredPayPeriod: "monthly",
      locationCountry: "NG",
      openToRelocation: false,
    });
  });

  it("turns nulls into absent fields rather than defaults", () => {
    const profile = toCandidateProfile(
      profileRow({
        desired_salary_min: null,
        desired_salary_max: null,
        desired_currency_code: null,
        desired_pay_period: null,
        location_country: null,
      }),
    );

    expect(profile.desiredSalaryMin).toBeUndefined();
    expect(profile.desiredCurrencyCode).toBeUndefined();
    expect(profile.locationCountry).toBeUndefined();
  });

  it("treats an unrecognised enum value as unspecified", () => {
    const profile = toCandidateProfile(
      profileRow({
        experience_level: "wizard",
        desired_work_arrangement: "moon",
      }),
    );

    expect(profile.experienceLevel).toBe("unspecified");
    expect(profile.desiredWorkArrangement).toBe("unspecified");
  });
});

describe("toJobFacts", () => {
  it("maps a fully populated feed job", () => {
    const facts = toJobFacts(feedJob());

    expect(facts.experienceLevel).toBe("mid");
    expect(facts.workArrangement).toBe("remote");
    expect(facts.salaryMin).toBe(400_000);
    expect(facts.currencyCode).toBe("NGN");
    expect(facts.payPeriod).toBe("monthly");
  });

  describe("reconciles the feed's vocabulary with the scorer's", () => {
    it("maps the feed's 'unknown' experience level to unspecified", () => {
      expect(
        toJobFacts(feedJob({ experienceLevel: "unknown" })).experienceLevel,
      ).toBe("unspecified");
    });

    it("maps the feed's 'unclear' work mode to unspecified", () => {
      expect(toJobFacts(feedJob({ workMode: "unclear" })).workArrangement).toBe(
        "unspecified",
      );
    });
  });

  describe("pay is only carried when it is comparable", () => {
    it("drops a salary with no currency", () => {
      const facts = toJobFacts(
        feedJob({
          salary: {
            originalText: "Competitive",
            currency: null,
            minimum: 400_000,
            maximum: null,
            payPeriod: "monthly",
            grossNet: "unknown",
          },
        }),
      );

      expect(facts.salaryMin).toBeUndefined();
      expect(facts.currencyCode).toBeUndefined();
    });

    it("drops a salary with an unknown pay period", () => {
      const facts = toJobFacts(
        feedJob({
          salary: {
            originalText: "NGN 400,000",
            currency: "NGN",
            minimum: 400_000,
            maximum: null,
            payPeriod: "unknown",
            grossNet: "unknown",
          },
        }),
      );

      expect(facts.salaryMin).toBeUndefined();
      expect(facts.payPeriod).toBeUndefined();
    });

    it("carries no pay when the source published none", () => {
      expect(toJobFacts(feedJob({ salary: null })).salaryMin).toBeUndefined();
    });
  });

  describe("eligibility", () => {
    it("recognises a worldwide scope that names no countries", () => {
      const facts = toJobFacts(
        feedJob({
          eligibility: {
            ...feedJob().eligibility,
            scope: "worldwide",
            nigeria: "unclear",
            includedCountries: [],
          },
        }),
      );

      expect(facts.eligibility.worldwide).toBe(true);
    });

    it("does not treat a regional scope as worldwide", () => {
      const facts = toJobFacts(
        feedJob({
          eligibility: { ...feedJob().eligibility, scope: "emea" },
        }),
      );

      expect(facts.eligibility.worldwide).toBe(false);
    });
  });
});

describe("adapted end to end", () => {
  it("scores a worldwide remote job for a Nigerian candidate on location", () => {
    // The case the plain country-list model got wrong: a worldwide posting names
    // no countries, and must still resolve as reachable rather than unknown.
    const job = feedJob({
      eligibility: {
        ...feedJob().eligibility,
        scope: "worldwide",
        nigeria: "unclear",
        includedCountries: [],
      },
    });
    const result = scoreJobMatch(
      toCandidateProfile(profileRow()),
      toJobFacts(job),
    );
    const location = result.dimensions.find(
      (entry) => entry.code === "location",
    );

    expect(location?.state).toBe("scored");
    expect(location?.score).toBe(1);
    expect(result.tier).toBe("strong_match");
  });

  it("reports insufficient data for an empty profile against a sparse job", () => {
    const result = scoreJobMatch(
      toCandidateProfile(
        profileRow({
          experience_level: "unspecified",
          desired_work_arrangement: "unspecified",
          desired_salary_min: null,
          desired_salary_max: null,
          desired_currency_code: null,
          desired_pay_period: null,
          location_country: null,
        }),
      ),
      toJobFacts(
        feedJob({
          salary: null,
          experienceLevel: "unknown",
          workMode: "unclear",
        }),
      ),
    );

    expect(result.tier).toBe("insufficient_data");
    expect(result.score).toBeNull();
  });
});
