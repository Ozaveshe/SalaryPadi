import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { countryPackReadinessSchema } from "./country-pack-readiness";

describe("country pack readiness DTO", () => {
  it("preserves blocked candidate packs and measured zeroes", () => {
    const countries = [
      [
        "NG",
        "Nigeria",
        "launch",
        "",
        "en-NG",
        "NGN",
        "Africa/Lagos",
        true,
        true,
      ],
      [
        "GH",
        "Ghana",
        "candidate",
        "/gh",
        "en-GH",
        "GHS",
        "Africa/Accra",
        false,
        false,
      ],
      [
        "KE",
        "Kenya",
        "candidate",
        "/ke",
        "en-KE",
        "KES",
        "Africa/Nairobi",
        false,
        false,
      ],
      [
        "ZA",
        "South Africa",
        "candidate",
        "/za",
        "en-ZA",
        "ZAR",
        "Africa/Johannesburg",
        false,
        false,
      ],
    ].map(
      ([
        code,
        name,
        state,
        prefix,
        locale,
        currency,
        timeZone,
        routes,
        index,
      ]) => ({
        country_code: code,
        name,
        pack_state: state,
        route_prefix: prefix,
        default_locale: locale,
        currency_code: currency,
        time_zone: timeZone,
        public_routes_enabled: routes,
        search_index_enabled: index,
        activation_ready: false,
        blockers: ["authorized_job_supply"],
        metrics: {
          authorized_active_jobs: 0,
          authorized_sources: 0,
          explicit_eligibility_ratio: 0,
          unique_content_pages: 0,
          first_party_contributions: 0,
          reviewed_tax_rules: 0,
          reviewed_employment_rules: 0,
        },
        thresholds: {
          authorized_active_jobs: 100,
          authorized_sources: 3,
          explicit_eligibility_ratio: 0.95,
          unique_content_pages: 20,
          first_party_contributions: 10,
        },
      }),
    );
    const parsed = countryPackReadinessSchema.parse({
      generated_at: "2026-07-14T12:00:00.000Z",
      countries,
    });
    expect(
      parsed.countries.filter((country) => country.public_routes_enabled),
    ).toHaveLength(1);
    expect(parsed.countries[1]).toMatchObject({
      country_code: "GH",
      activation_ready: false,
      metrics: { authorized_active_jobs: 0 },
    });
  });
});
