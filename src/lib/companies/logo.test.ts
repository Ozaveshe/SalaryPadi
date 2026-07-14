import { describe, expect, it } from "vitest";

import { getAfricanCompanyCatalogEntry } from "@/lib/companies/catalog";
import {
  buildCompanyLogoFallback,
  resolveCompanyLogo,
} from "@/lib/companies/logo";

const company = getAfricanCompanyCatalogEntry("safaricom");
if (!company) throw new Error("Safaricom fixture missing from catalog");

describe("company logo resolver", () => {
  it("returns a self-contained monogram when enrichment is not configured", async () => {
    const response = await resolveCompanyLogo(company, undefined);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
    expect(response.headers.get("x-salarypadi-logo-state")).toBe(
      "monogram_fallback",
    );
    expect(await response.text()).toContain(">S<");
  });

  it("fetches only the fixed provider host with the manifest-owned domain", async () => {
    let requestedUrl = "";
    const fetcher: typeof fetch = async (input) => {
      requestedUrl = String(input);
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "Content-Type": "image/png", "Content-Length": "4" },
      });
    };
    const response = await resolveCompanyLogo(company, "pk_test_key", fetcher);
    const requested = new URL(requestedUrl);
    expect(requested.origin).toBe("https://img.logo.dev");
    expect(requested.pathname).toBe("/safaricom.co.ke");
    expect(requested.searchParams.get("fallback")).toBe("404");
    expect(response.headers.get("x-salarypadi-logo-state")).toBe(
      "provider_logo",
    );
  });

  it("rejects non-image and oversized provider responses", async () => {
    const html = await resolveCompanyLogo(
      company,
      "pk_test_key",
      (async () =>
        new Response("login", {
          headers: { "Content-Type": "text/html" },
        })) as typeof fetch,
    );
    expect(html.headers.get("x-salarypadi-logo-state")).toBe(
      "provider_unavailable",
    );

    const oversized = await resolveCompanyLogo(
      company,
      "pk_test_key",
      (async () =>
        new Response(new Uint8Array([1]), {
          headers: { "Content-Type": "image/png", "Content-Length": "1048577" },
        })) as typeof fetch,
    );
    expect(oversized.headers.get("x-salarypadi-logo-state")).toBe(
      "provider_unavailable",
    );
  });

  it("escapes catalog names in generated SVG", () => {
    const svg = buildCompanyLogoFallback({ ...company, name: "A < B & Co" });
    expect(svg).not.toContain("A < B");
    expect(svg).toContain("A &lt; B &amp; Co monogram");
  });
});
