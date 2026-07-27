import { describe, expect, it } from "vitest";

import { getAfricanCompanyCatalogEntry } from "@/lib/companies/catalog";
import {
  buildCompanyLogoFallback,
  companyLogoStaticPath,
  resolveCompanyLogo,
} from "@/lib/companies/logo";

const company = getAfricanCompanyCatalogEntry("safaricom");
if (!company) throw new Error("Safaricom fixture missing from catalog");

const companyWithLogo = {
  ...company,
  logo: {
    file: "safaricom.webp",
    sourceUrl: "https://www.safaricom.co.ke/media-centre",
    sourceTitle: "Safaricom media centre",
    obtainedAt: "2026-07-26",
  },
} as const;

describe("company logo resolver", () => {
  it("returns a self-contained monogram for a company with no logo record", () => {
    const response = resolveCompanyLogo(company);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
    expect(response.headers.get("x-salarypadi-logo-state")).toBe(
      "monogram_fallback",
    );
  });

  it("reports no static path until a logo record exists", () => {
    expect(companyLogoStaticPath(company)).toBeNull();
  });

  it("serves the self-hosted file from the static logo directory", () => {
    expect(companyLogoStaticPath(companyWithLogo)).toBe(
      "/logos/safaricom.webp",
    );
    const response = resolveCompanyLogo(companyWithLogo);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/logos/safaricom.webp");
    expect(response.headers.get("x-salarypadi-logo-state")).toBe(
      "self_hosted_logo",
    );
  });

  it("never redirects outside the static logo directory", () => {
    const response = resolveCompanyLogo(companyWithLogo);
    const location = response.headers.get("location") ?? "";
    expect(location.startsWith("/logos/")).toBe(true);
    expect(location).not.toContain("//");
    expect(location).not.toContain("..");
  });

  it("escapes catalog names in generated SVG", () => {
    const svg = buildCompanyLogoFallback({ ...company, name: "A < B & Co" });
    expect(svg).not.toContain("A < B");
    expect(svg).toContain("A &lt; B &amp; Co monogram");
  });
});
