import { describe, expect, it } from "vitest";

import {
  getAfricanCompanyCatalog,
  getAfricanCompanyCatalogEntry,
} from "@/lib/companies/catalog";

describe("African company catalog", () => {
  it("contains the complete ranked launch cohort with stable identities", () => {
    const companies = getAfricanCompanyCatalog();
    expect(companies).toHaveLength(100);
    expect(new Set(companies.map((company) => company.rank)).size).toBe(100);
    expect(new Set(companies.map((company) => company.slug)).size).toBe(100);
    expect(new Set(companies.map((company) => company.domain)).size).toBe(100);
    expect(
      companies.map((company) => company.rank).toSorted((a, b) => a - b),
    ).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
  });

  it("spans markets outside Nigeria and multiple African regions", () => {
    const companies = getAfricanCompanyCatalog();
    expect(
      new Set(companies.map((company) => company.marketCountryCode)).size,
    ).toBeGreaterThanOrEqual(10);
    expect(
      new Set(companies.map((company) => company.region)).size,
    ).toBeGreaterThanOrEqual(4);
    expect(
      companies.some((company) => company.marketCountryCode === "NG"),
    ).toBe(true);
    expect(
      companies.some((company) => company.marketCountryCode === "ZA"),
    ).toBe(true);
    expect(
      companies.some((company) => company.marketCountryCode === "EG"),
    ).toBe(true);
    expect(
      companies.some((company) => company.marketCountryCode === "KE"),
    ).toBe(true);
  });

  it("uses manifest slugs as the only logo allowlist", () => {
    expect(getAfricanCompanyCatalogEntry("safaricom")?.domain).toBe(
      "safaricom.co.ke",
    );
    expect(
      getAfricanCompanyCatalogEntry("https://169.254.169.254/latest/meta-data"),
    ).toBeNull();
    expect(getAfricanCompanyCatalogEntry("unknown-company")).toBeNull();
  });
});
