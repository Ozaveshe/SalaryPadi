import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { explicitlyAllowsCountry } from "./eligibility";
import {
  formatCountryCurrency,
  formatCountryDate,
  formatCountryNumber,
} from "./format";
import {
  COUNTRY_PACKS,
  getCountryPack,
  isCountryPackIndexable,
  isCountryPackPublic,
} from "./registry";
import { evaluateCountryPackReadiness } from "./readiness";
import {
  countryAlternates,
  localizedCountryPath,
  resolveCountryRoute,
} from "./routing";

const evidenceSchema = z.object({
  authorizedActiveJobs: z.number(),
  authorizedSources: z.number(),
  explicitEligibilityRatio: z.number(),
  uniqueContentPages: z.number(),
  firstPartyContributions: z.number(),
  reviewedTaxRules: z.number(),
  reviewedEmploymentRules: z.number(),
  reviewGates: z.record(z.string(), z.boolean()),
});
const fixtureSchema = z.object({
  testOnly: z.literal(true),
  countries: z
    .array(
      z.object({
        countryCode: z.string().length(2),
        subdivision: z.object({ fixtureId: z.string(), name: z.string() }),
        city: z.object({ fixtureId: z.string(), name: z.string() }),
      }),
    )
    .length(4),
  readinessEvidence: z.object({
    ready: evidenceSchema,
    blocked: evidenceSchema,
  }),
});

const fixture = fixtureSchema.parse(
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), "tests/fixtures/country-packs.json"),
      "utf8",
    ),
  ),
);
const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260714050000_country_pack_architecture.sql",
  ),
  "utf8",
);

describe("country pack registry", () => {
  it("keeps Nigeria public and every expansion pack fail closed", () => {
    expect(COUNTRY_PACKS.map((pack) => pack.countryCode)).toEqual([
      "NG",
      "GH",
      "KE",
      "ZA",
    ]);
    expect(
      COUNTRY_PACKS.filter(isCountryPackPublic).map((pack) => pack.countryCode),
    ).toEqual(["NG"]);
    expect(
      COUNTRY_PACKS.filter(isCountryPackIndexable).map(
        (pack) => pack.countryCode,
      ),
    ).toEqual(["NG"]);
    expect(COUNTRY_PACKS.every((pack) => !pack.activation.autoTranslate)).toBe(
      true,
    );
  });

  it("does not emit routes or hreflang for candidate packs", () => {
    expect(localizedCountryPath(getCountryPack("GH")!, "/jobs")).toBeNull();
    expect(resolveCountryRoute("/gh/jobs")).toMatchObject({
      path: "/jobs",
      public: false,
      pack: { countryCode: "GH" },
    });
    expect(countryAlternates("https://salarypadi.example", "/jobs")).toEqual({
      canonical: "https://salarypadi.example/jobs",
      languages: {
        "en-NG": "https://salarypadi.example/jobs",
        "x-default": "https://salarypadi.example/jobs",
      },
    });
  });

  it("formats currency, dates, and numbers from the pack", () => {
    const ghana = getCountryPack("GH")!;
    expect(formatCountryCurrency(1_000, ghana)).toContain("1,000");
    expect(formatCountryNumber(12_345.6, ghana)).toContain("12,345.6");
    expect(formatCountryDate("2026-07-14T23:30:00.000Z", ghana)).not.toBe(
      "Unknown",
    );
  });

  it("never infers all African countries from EMEA or generic remote", () => {
    expect(
      explicitlyAllowsCountry(
        { scope: "emea", includedCountries: [], excludedCountries: [] },
        "GH",
      ),
    ).toBe(false);
    expect(
      explicitlyAllowsCountry(
        { scope: "unclear", includedCountries: [], excludedCountries: [] },
        "KE",
      ),
    ).toBe(false);
    expect(
      explicitlyAllowsCountry(
        { scope: "emea", includedCountries: ["ZA"], excludedCountries: [] },
        "ZA",
      ),
    ).toBe(true);
    expect(
      explicitlyAllowsCountry(
        { scope: "africa", includedCountries: [], excludedCountries: ["NG"] },
        "NG",
      ),
    ).toBe(false);
  });

  it("requires every quantitative and reviewed activation gate", () => {
    const ghana = getCountryPack("GH")!;
    expect(
      evaluateCountryPackReadiness(ghana, fixture.readinessEvidence.ready),
    ).toEqual({
      ready: true,
      blockers: [],
    });
    const blocked = evaluateCountryPackReadiness(
      ghana,
      fixture.readinessEvidence.blocked,
    );
    expect(blocked.ready).toBe(false);
    expect(blocked.blockers).toEqual(
      expect.arrayContaining([
        "authorized_job_supply",
        "source_diversity",
        "reviewed_statutory_rules",
        "first_party_data",
        "seo_canonical_hreflang",
      ]),
    );
  });

  it("keeps geographic fixture records outside production configuration", () => {
    expect(fixture.testOnly).toBe(true);
    expect(fixture.countries.map((country) => country.countryCode)).toEqual([
      "NG",
      "GH",
      "KE",
      "ZA",
    ]);
    expect(
      fixture.countries.every((country) =>
        country.subdivision.fixtureId.startsWith("test-"),
      ),
    ).toBe(true);
  });

  it("pins the database fail-closed boundaries in the migration artifact", () => {
    expect(migration).toContain("app.source_country_rights");
    expect(migration).toContain("security.enforce_fetch_country_rights()");
    expect(migration).toContain("security.enforce_country_pack_activation()");
    expect(migration).toContain("security.job_explicitly_allows_country");
    expect(migration).toContain("security.job_country_distribution_allowed");
    expect(migration).toContain("security.google_indexing_job_is_eligible");
    expect(migration).toContain("api.admin_get_country_pack_readiness()");
    expect(migration).not.toMatch(/eligibility\.scope\s*=\s*'emea'/);
  });
});
