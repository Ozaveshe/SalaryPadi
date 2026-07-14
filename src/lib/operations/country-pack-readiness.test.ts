import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  countryPackReadinessSchema,
  getCountryPackReadiness,
  getCountryPackReadinessResult,
} from "./country-pack-readiness";

describe("country pack readiness DTO", () => {
  it("preserves blocked candidate packs and measured zeroes", async () => {
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
        blockers: [
          "authorized_job_supply",
          "source_diversity",
          "local_eligibility_accuracy",
          "reviewed_statutory_rules",
          "unique_localized_content",
          "first_party_data",
        ],
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
    const evidence = {
      generated_at: "2026-07-14T12:00:00.000Z",
      countries,
    };
    const parsed = countryPackReadinessSchema.parse(evidence);
    expect(
      parsed.countries.filter((country) => country.public_routes_enabled),
    ).toHaveLength(1);
    expect(parsed.countries[1]).toMatchObject({
      country_code: "GH",
      activation_ready: false,
      metrics: { authorized_active_jobs: 0 },
    });

    const rpc = vi.fn().mockResolvedValue({ data: evidence, error: null });
    const client = { schema: () => ({ rpc }) } as never;
    await expect(getCountryPackReadiness(client)).resolves.toEqual(evidence);
    expect((await getCountryPackReadinessResult(client)).state).toBe("ready");
    expect(rpc).toHaveBeenCalledWith("admin_get_country_pack_readiness");
  });

  it("uses a stable failure code for unavailable readiness evidence", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: "rpc_failed" } });
    const client = { schema: () => ({ rpc }) } as never;

    const result = await getCountryPackReadinessResult(client);

    expect(result.state).toBe("unavailable");
    expect(result.issues[0]?.code).toBe("country_pack_readiness_query_failed");
  });

  it("rejects duplicate country rows and contradictory activation evidence", () => {
    const country = {
      country_code: "NG",
      name: "Nigeria",
      pack_state: "launch",
      route_prefix: "",
      default_locale: "en-NG",
      currency_code: "NGN",
      time_zone: "Africa/Lagos",
      public_routes_enabled: true,
      search_index_enabled: true,
      activation_ready: true,
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
    };

    expect(
      countryPackReadinessSchema.safeParse({
        generated_at: "2026-07-14T12:00:00.000Z",
        countries: [country, country, country, country],
      }).success,
    ).toBe(false);
  });

  it("rejects missing measured blockers and impossible public route state", () => {
    const country = {
      country_code: "NG",
      name: "Nigeria",
      pack_state: "candidate",
      route_prefix: "",
      default_locale: "en-NG",
      currency_code: "NGN",
      time_zone: "Africa/Lagos",
      public_routes_enabled: false,
      search_index_enabled: true,
      activation_ready: false,
      blockers: ["moderation_privacy_takedown"],
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
    };

    expect(
      countryPackReadinessSchema.safeParse({
        generated_at: "2026-07-14T12:00:00.000Z",
        countries: [
          country,
          { ...country, country_code: "GH", name: "Ghana" },
          { ...country, country_code: "KE", name: "Kenya" },
          { ...country, country_code: "ZA", name: "South Africa" },
        ],
      }).success,
    ).toBe(false);
  });
});
