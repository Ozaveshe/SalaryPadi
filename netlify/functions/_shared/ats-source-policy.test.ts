import { describe, expect, it } from "vitest";

import {
  parseAuthorizedAtsRuntimePolicies,
  parseClaimedAuthorizedAtsRuntimePolicy,
} from "./ats-source-policy";

const currentTime = new Date("2026-07-11T12:00:00.000Z");

function row(overrides: Record<string, unknown> = {}) {
  return {
    source_id: "10000000-0000-4000-8000-000000000001",
    company_id: "20000000-0000-4000-8000-000000000001",
    adapter_key: "employer_ats_example",
    source_name: "Example careers",
    employer_name: "Example Nigeria",
    provider: "greenhouse",
    provider_region: null,
    tenant_identifier: "example",
    allowed_destination_hosts: [
      "boards.greenhouse.io",
      "careers.example.com",
      "careers.example.com",
    ],
    allowed_destination_path_prefixes: ["/example", "/jobs", "/careers"],
    fetch_interval_seconds: 43_200,
    daily_request_budget: 4,
    minimum_request_spacing_seconds: 300,
    publication_mode: "review",
    homepage_url: "https://example.com/careers",
    terms_url: "https://example.com/terms",
    terms_version: "permission-2026-07-11",
    attribution_required: true,
    attribution_text: "Source: Example careers",
    may_store_full_description: false,
    may_index_jobs: false,
    may_emit_jobposting_schema: false,
    may_email_jobs: false,
    required_destination_kind: "employer_application_url",
    authorization_basis: "written_permission",
    authorization_grantor: "Example Recruiting Operations",
    authorization_evidence_ref: "vault:source-permission/example/2026-07-11",
    authorization_reviewed_at: "2026-07-11T10:00:00.000Z",
    authorization_expires_at: "2027-07-11T10:00:00.000Z",
    ...overrides,
  };
}

describe("authorized ATS runtime policy", () => {
  it("constructs adapter authorization only from the trusted RPC shape", () => {
    const policies = parseAuthorizedAtsRuntimePolicies([row()], currentTime);
    expect(policies).toHaveLength(1);
    expect(policies[0]).toMatchObject({
      publicationMode: "review",
      mayStoreFullDescription: false,
      source: {
        state: "authorized",
        provider: "greenhouse",
        tenant: "example",
        employerName: "Example Nigeria",
        authorization: {
          kind: "employer",
          authorizedBy: "Example Recruiting Operations",
          evidenceReference: "vault:source-permission/example/2026-07-11",
          allowedDestinations: [
            { host: "boards.greenhouse.io", pathPrefixes: ["/example"] },
            {
              host: "careers.example.com",
              pathPrefixes: ["/jobs", "/careers"],
            },
          ],
        },
      },
    });
  });

  it("maps Lever's reviewed region", () => {
    const [policy] = parseAuthorizedAtsRuntimePolicies(
      [row({ provider: "lever", provider_region: "eu" })],
      currentTime,
    );
    expect(policy?.source).toMatchObject({ provider: "lever", region: "eu" });
  });

  it.each([
    { authorization_basis: "documented_public_api" },
    { authorization_grantor: null },
    { authorization_expires_at: "2026-07-11T11:00:00.000Z" },
    { authorization_reviewed_at: "2026-07-11T13:00:00.000Z" },
    { allowed_destination_path_prefixes: ["/one"] },
    { provider: "ashby", provider_region: "eu" },
    { minimum_request_spacing_seconds: 50_000 },
  ])("fails closed for invalid policy %#", (override) => {
    expect(() =>
      parseAuthorizedAtsRuntimePolicies([row(override)], currentTime),
    ).toThrow();
  });

  it("rejects duplicate adapter keys", () => {
    expect(() =>
      parseAuthorizedAtsRuntimePolicies([row(), row()], currentTime),
    ).toThrow("ats_source_policy_duplicate");
  });

  it("parses the exact policy returned by an atomic fetch claim", () => {
    expect(
      parseClaimedAuthorizedAtsRuntimePolicy(
        { claimed: true, policy: row() },
        currentTime,
      ),
    ).toMatchObject({
      claimed: true,
      policy: { source: { key: "employer_ats_example" } },
    });
    expect(
      parseClaimedAuthorizedAtsRuntimePolicy({ claimed: false }, currentTime),
    ).toEqual({ claimed: false, policy: null });
  });

  it("rejects a claimed response without its locked policy", () => {
    expect(() =>
      parseClaimedAuthorizedAtsRuntimePolicy({ claimed: true }, currentTime),
    ).toThrow("ats_source_claim_invalid");
  });
});
