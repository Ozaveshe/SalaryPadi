import { describe, expect, it } from "vitest";

import { openSupplyAdapter, SUPPLY_ADAPTERS } from "./adapters";
import {
  AdapterPolicyError,
  assertRunnableSourcePolicy,
  jobSourcePolicyRegistry,
  parseJobSourcePolicyRegistry,
} from "./policy";
import {
  effectivePollingSeconds,
  fullJitterDelayMs,
  JOB_SUPPLY_SCHEDULES,
} from "./schedules";

describe("job source policy registry", () => {
  it("contains only explicitly supported adapters and no forbidden source", () => {
    const forbidden = new Set([
      "linkedin",
      "indeed",
      "glassdoor",
      "jobberman",
      "myjobmag",
      "brightermonday",
      "google_jobs",
      "workday",
    ]);
    expect(jobSourcePolicyRegistry.sources).toHaveLength(
      Object.keys(SUPPLY_ADAPTERS).length,
    );
    expect(
      jobSourcePolicyRegistry.sources.some((policy) =>
        forbidden.has(policy.adapterKey),
      ),
    ).toBe(false);
  });

  it("fails closed for missing, disabled, and overdue policies", () => {
    expect(() =>
      assertRunnableSourcePolicy("not_registered", [], new Date("2026-07-14")),
    ).toThrow(
      expect.objectContaining<Partial<AdapterPolicyError>>({
        code: "policy_missing",
      }),
    );
    expect(() => openSupplyAdapter("remotive", new Date("2026-07-14"))).toThrow(
      expect.objectContaining<Partial<AdapterPolicyError>>({
        code: "policy_disabled",
        adapterKey: "remotive",
      }),
    );
    expect(() =>
      openSupplyAdapter(
        "salarypadi_employer_submissions",
        new Date("2026-08-10T00:00:00.000Z"),
      ),
    ).toThrow(
      expect.objectContaining<Partial<AdapterPolicyError>>({
        code: "policy_review_overdue",
      }),
    );
  });

  it("opens the existing consented direct-submission lane only within policy", () => {
    expect(
      openSupplyAdapter(
        "salarypadi_employer_submissions",
        new Date("2026-07-14T00:00:00.000Z"),
      ).policy,
    ).toMatchObject({
      state: "enabled",
      authority: "direct_employer",
      publicDisplayPermission: true,
      searchIndexPermission: true,
      googleJobPostingPermission: true,
      missingDependencies: [],
    });
  });

  it("opens Jobicy only with the reviewed attribution and distribution limits", () => {
    expect(
      openSupplyAdapter("jobicy", new Date("2026-07-14T12:00:00.000Z")).policy,
    ).toMatchObject({
      state: "enabled",
      authority: "secondary_feed",
      publicDisplayPermission: true,
      searchIndexPermission: false,
      googleJobPostingPermission: false,
      missingDependencies: [],
    });
  });

  it("opens Himalayas only with daily polling and no syndication rights", () => {
    expect(
      openSupplyAdapter("himalayas", new Date("2026-07-15T12:00:00.000Z"))
        .policy,
    ).toMatchObject({
      state: "enabled",
      authority: "secondary_feed",
      publicDisplayPermission: true,
      searchIndexPermission: false,
      googleJobPostingPermission: false,
      minimumPollingSeconds: 86_400,
      maximumRequestsPerDay: 3,
      missingDependencies: [],
    });
  });

  it("keeps secondary feeds out of search and Google Jobs", () => {
    for (const key of ["remotive", "jobicy", "himalayas"] as const) {
      const policy = jobSourcePolicyRegistry.sources.find(
        (candidate) => candidate.adapterKey === key,
      );
      expect(policy).toMatchObject({
        searchIndexPermission: false,
        googleJobPostingPermission: false,
        fullDescriptionPermission: false,
      });
    }
    expect(
      jobSourcePolicyRegistry.sources.find(
        (candidate) => candidate.adapterKey === "remotive",
      )?.state,
    ).toBe("disabled");
    expect(
      jobSourcePolicyRegistry.sources.find(
        (candidate) => candidate.adapterKey === "jobicy",
      )?.state,
    ).toBe("enabled");
  });

  it("lists exact external dependencies instead of fabricating access", () => {
    expect(
      jobSourcePolicyRegistry.sources.find(
        (policy) => policy.adapterKey === "licensed_africa_partner",
      )?.missingDependencies,
    ).toEqual([
      "signed_data_licence",
      "feed_credentials",
      "field_and_retention_schedule",
    ]);
    expect(
      jobSourcePolicyRegistry.sources.find(
        (policy) => policy.adapterKey === "reliefweb",
      )?.missingDependencies,
    ).toContain("preapproved_reliefweb_app_name");
  });

  it("rejects duplicate adapters and contradictory rights evidence", () => {
    const duplicate = structuredClone(jobSourcePolicyRegistry);
    duplicate.sources.push(structuredClone(duplicate.sources[0]!));
    expect(() => parseJobSourcePolicyRegistry(duplicate)).toThrow();

    const invalidReview = structuredClone(jobSourcePolicyRegistry);
    invalidReview.sources[0]!.reviewDueAt =
      invalidReview.sources[0]!.reviewedAt;
    expect(() => parseJobSourcePolicyRegistry(invalidReview)).toThrow();
  });

  it("rejects unsafe terms URLs and impossible publication permissions", () => {
    const unsafeTerms = structuredClone(jobSourcePolicyRegistry);
    unsafeTerms.sources[1]!.termsUrl = "https://user:secret@example.com/terms";
    expect(() => parseJobSourcePolicyRegistry(unsafeTerms)).toThrow();

    const impossibleIndexing = structuredClone(jobSourcePolicyRegistry);
    impossibleIndexing.sources[1]!.searchIndexPermission = true;
    impossibleIndexing.sources[1]!.publicDisplayPermission = false;
    expect(() => parseJobSourcePolicyRegistry(impossibleIndexing)).toThrow();
  });
});

describe("supply schedules and retry bounds", () => {
  it("registers every requested default schedule", () => {
    expect(JOB_SUPPLY_SCHEDULES).toMatchObject({
      dispatcher: { intervalMinutes: 15 },
      licensed_incremental: { intervalMinutes: 60 },
      employer_ats: {
        intervalMinutes: 15,
        jitterMinutes: 2,
        sourcePollMinutes: 120,
      },
      reliefweb_incremental: { intervalMinutes: 120 },
      remotive: { intervalMinutes: 360 },
      jobicy: { intervalMinutes: 360 },
      himalayas: { intervalMinutes: 1_440 },
      deadline_and_alerts: { intervalMinutes: 15 },
      apply_link_full: { intervalMinutes: 1_440 },
      fuzzy_review: { intervalMinutes: 1_440 },
      health_digest: { intervalMinutes: 1_440 },
      rights_review: { intervalMinutes: 43_200 },
    });
  });

  it("lets a stricter contract slow a default but never accelerate it", () => {
    expect(effectivePollingSeconds(3_600, 21_600)).toBe(21_600);
    expect(effectivePollingSeconds(21_600, 3_600)).toBe(21_600);
  });

  it("uses bounded full jitter", () => {
    expect(fullJitterDelayMs(3, 100, 10_000, () => 0.5)).toBe(400);
    expect(fullJitterDelayMs(20, 100, 10_000, () => 0.999)).toBeLessThan(
      10_000,
    );
  });
});
