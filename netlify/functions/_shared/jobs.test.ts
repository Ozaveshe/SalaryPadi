import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeRemotiveJob } from "../../../src/lib/jobs/normalize";
import {
  buildJobFingerprint,
  buildLegacyJobFingerprint,
} from "../../../src/lib/jobs/fingerprint";
import type { RemotiveJob } from "../../../src/lib/jobs/remotive-schema";

const { blobGet } = vi.hoisted(() => ({ blobGet: vi.fn() }));

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({ get: blobGet }),
}));

import {
  assertAlertJobsPublishable,
  createAlertCatalog,
  fetchAlertJobCatalog,
  fetchPublishedRemotiveSnapshot,
  matchAlertJobs,
  mergeAlertJobCatalogs,
  parseAlertCatalog,
  parseRemotivePublicationEnabled,
  renderAlertEmail,
} from "./jobs";

const sourceJob: RemotiveJob = {
  id: 42,
  url: "https://remotive.com/remote-jobs/software-dev/example-42",
  title: "Senior Platform Engineer",
  company_name: "Example Ltd",
  company_logo: "",
  category: "Software Development",
  tags: ["TypeScript", "PostgreSQL"],
  job_type: "full_time",
  publication_date: "2026-07-09T09:00:00Z",
  candidate_required_location: "Worldwide",
  salary: "$70,000-$90,000",
  description:
    "<p>Private source description must not enter the alert cache.</p>",
};

function normalizedJob(checkedAt = "2026-07-10T06:00:00Z") {
  return normalizeRemotiveJob(sourceJob, checkedAt);
}

afterEach(() => {
  blobGet.mockReset();
  vi.unstubAllGlobals();
});

describe("alert job catalog", () => {
  it("retains matching facts but removes source descriptions", () => {
    const job = normalizedJob();
    const catalog = createAlertCatalog([job], "2026-07-10T06:00:00Z");

    expect(catalog.jobs[0]).toMatchObject({
      title: "Senior Platform Engineer",
      description: "",
      requirements: null,
      benefits: null,
      riskIndicators: [],
    });
    expect(JSON.stringify(catalog)).not.toContain("Private source description");
    expect(
      parseAlertCatalog(catalog, new Date("2026-07-10T06:00:00Z")),
    ).toEqual(catalog.jobs);
  });

  it("deep-validates every job instead of trusting a typed Blob payload", () => {
    const job = normalizedJob();
    const catalog = createAlertCatalog([job], "2026-07-10T06:00:00Z");
    const validJob = catalog.jobs[0]!;
    const invalidCatalogs: unknown[] = [
      {
        ...catalog,
        jobs: [
          validJob,
          {
            ...validJob,
            company: { ...validJob.company, verification: "self_attested" },
          },
        ],
      },
      {
        ...catalog,
        jobs: [
          {
            ...validJob,
            description: "A private description escaped redaction.",
          },
        ],
      },
      {
        ...catalog,
        jobs: [{ ...validJob, applicationUrl: "http://example.test/apply" }],
      },
    ];

    for (const invalid of invalidCatalogs) {
      expect(() =>
        parseAlertCatalog(invalid, new Date("2026-07-10T06:00:00Z")),
      ).toThrow("alert_catalog_shape");
    }
  });

  it("rejects a stale catalog instead of silently skipping alerts", () => {
    const job = normalizeRemotiveJob(sourceJob, "2026-07-09T00:00:00Z");
    const catalog = createAlertCatalog([job], "2026-07-09T00:00:00Z");

    expect(() =>
      parseAlertCatalog(catalog, new Date("2026-07-10T00:00:01Z")),
    ).toThrow("alert_catalog_stale");
  });

  it("uses the same fourteen-hour freshness boundary as worker health", () => {
    const job = normalizedJob("2026-07-09T00:00:00Z");
    const catalog = createAlertCatalog([job], "2026-07-09T00:00:00Z");

    expect(
      parseAlertCatalog(catalog, new Date("2026-07-09T14:00:00.000Z")),
    ).toHaveLength(1);
    expect(() =>
      parseAlertCatalog(catalog, new Date("2026-07-09T14:00:00.001Z")),
    ).toThrow("alert_catalog_stale");
  });

  it("re-keys legacy Blob jobs and lets the database source win a collision", () => {
    const remote = normalizedJob();
    const trackedDestination = `${remote.applicationUrl}?utm_source=remotive`;
    const fingerprintInput = {
      title: remote.title,
      company: remote.company.name,
      location: remote.locationDisplay,
      arrangement: remote.arrangement,
      destination: trackedDestination,
    };
    const legacyRemote = {
      ...remote,
      applicationUrl: trackedDestination,
      sourceUrl: trackedDestination,
      fingerprint: buildLegacyJobFingerprint(fingerprintInput),
    };
    const employer = {
      ...remote,
      id: "00000000-0000-4000-8000-000000000077",
      databaseId: "00000000-0000-4000-8000-000000000077",
      source: {
        ...remote.source,
        id: "00000000-0000-4000-8000-000000000078",
        name: "Example employer submission",
        type: "employer" as const,
      },
    };

    const merged = mergeAlertJobCatalogs([employer], [legacyRemote]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe(employer.id);
    expect(merged[0]?.fingerprint).toBe(
      buildJobFingerprint({
        ...fingerprintInput,
        destination: employer.applicationUrl,
      }),
    );
  });

  it("allows five minutes of clock skew but rejects a catalog further in the future", () => {
    const job = normalizedJob("2026-07-10T00:00:00Z");
    const exactBoundary = createAlertCatalog([job], "2026-07-10T00:05:00.000Z");
    const beyondBoundary = createAlertCatalog(
      [job],
      "2026-07-10T00:05:00.001Z",
    );
    const now = new Date("2026-07-10T00:00:00.000Z");

    expect(parseAlertCatalog(exactBoundary, now)).toHaveLength(1);
    expect(() => parseAlertCatalog(beyondBoundary, now)).toThrow(
      "alert_catalog_future",
    );
  });
});

describe("alert email links", () => {
  it("uses the stable job ID rather than a mutable display slug", () => {
    vi.stubGlobal("Netlify", {
      env: {
        get: (name: string) =>
          name === "NEXT_PUBLIC_APP_URL" ? "https://salarypadi.com" : undefined,
      },
    });
    const job = {
      ...normalizedJob(),
      slug: "a-new-title-can-change-this-slug",
    };

    const email = renderAlertEmail([job]);

    expect(email.text).toContain("https://salarypadi.com/jobs/remotive-42");
    expect(email.html).toContain(
      'href="https://salarypadi.com/jobs/remotive-42"',
    );
    expect(email.text).not.toContain(job.slug);
    expect(email.html).not.toContain(job.slug);
  });
});

describe("alert source permissions", () => {
  it("does not redistribute the Remotive pilot by private email", () => {
    const claim = {
      delivery_id: "00000000-0000-4000-8000-000000000001",
      claim_token: "claim-token",
      alert_id: "00000000-0000-4000-8000-000000000002",
      recipient_email: "private@example.test",
      search_spec: {},
      cadence: "daily" as const,
      last_sent_at: null,
    };
    const job = normalizedJob("2026-07-09T10:00:00Z");

    expect(
      matchAlertJobs(claim, [job], new Date("2026-07-09T12:00:00Z")),
    ).toEqual([]);
    expect(
      matchAlertJobs(
        claim,
        [
          {
            ...job,
            id: "00000000-0000-4000-8000-000000000003",
            databaseId: "00000000-0000-4000-8000-000000000003",
            source: {
              ...job.source,
              id: "00000000-0000-4000-8000-000000000004",
              type: "employer",
              name: "Reviewed employer submission",
              canEmail: true,
            },
          },
        ],
        new Date("2026-07-09T12:00:00Z"),
      ),
    ).toHaveLength(1);
  });
});

describe("published source snapshot client", () => {
  it("calls only the protected SalaryPadi origin and validates the snapshot", async () => {
    vi.stubGlobal("Netlify", {
      env: {
        get: (name: string) =>
          ({
            NEXT_PUBLIC_APP_URL: "https://salarypadi.com",
            JOB_SOURCE_SYNC_TOKEN: "test-source-sync-token-0000000000000000",
          })[name],
      },
    });
    const catalog = createAlertCatalog(
      [normalizedJob()],
      new Date().toISOString(),
    );
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(catalog));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      fetchPublishedRemotiveSnapshot(new AbortController().signal),
    ).resolves.toEqual(catalog);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://salarypadi.com/api/internal/job-source-snapshot",
    );
    expect(init).toMatchObject({
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer test-source-sync-token-0000000000000000",
    );
  });

  it("preserves only an allowlisted safe source failure code", async () => {
    vi.stubGlobal("Netlify", {
      env: {
        get: (name: string) =>
          ({
            NEXT_PUBLIC_APP_URL: "https://salarypadi.com",
            JOB_SOURCE_SYNC_TOKEN: "test-source-sync-token-0000000000000000",
          })[name],
      },
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(
            { error: "remotive_invalid_payload", source_state: "unavailable" },
            { status: 503 },
          ),
        ),
    );

    await expect(fetchPublishedRemotiveSnapshot()).rejects.toMatchObject({
      code: "remotive_invalid_payload",
    });
  });
});

describe("alert source publication gate", () => {
  const activePolicy = {
    adapter_key: "remotive",
    source_type: "permitted_api",
    terms_url: "https://remotive.com/terms-of-use",
    terms_reviewed_at: "2026-07-14T00:00:00+00:00",
    terms_version: "remotive-terms-conflict-reviewed-2026-07-14",
    attribution_required: true,
    may_store_full_description: false,
    may_index_jobs: false,
    may_emit_jobposting_schema: false,
    allow_public_listing: true,
    required_destination_kind: "source_url",
    refresh_interval_seconds: 21_600,
  };

  it("enables the Blob only for the exact reviewed public source contract", () => {
    expect(parseRemotivePublicationEnabled([activePolicy])).toBe(true);
    expect(parseRemotivePublicationEnabled([])).toBe(false);
    expect(() =>
      parseRemotivePublicationEnabled([
        { ...activePolicy, may_index_jobs: true },
      ]),
    ).toThrow("remotive_public_policy_shape");
  });

  it("honors the emergency kill switch again at the email send boundary", async () => {
    vi.stubGlobal("Netlify", {
      env: {
        get: (name: string) =>
          name === "REMOTIVE_SOURCE_ENABLED" ? "false" : undefined,
      },
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      assertAlertJobsPublishable(
        [normalizedJob()],
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "remotive_source_revoked" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to canonical database jobs when the optional alert cache is stale", async () => {
    vi.stubGlobal("Netlify", {
      context: { deploy: { context: "production" } },
      env: {
        get: (name: string) =>
          ({
            NEXT_PUBLIC_SUPABASE_URL:
              "https://bxelrhklsznmpksgrqep.supabase.co",
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
            REMOTIVE_SOURCE_ENABLED: "true",
          })[name],
      },
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockImplementation(async (input) =>
          Response.json(
            String(input).includes("/rest/v1/jobs?") ? [] : [activePolicy],
          ),
        ),
    );
    blobGet.mockResolvedValue(
      createAlertCatalog([normalizedJob()], "2000-01-01T00:00:00Z"),
    );

    await expect(
      fetchAlertJobCatalog(new AbortController().signal),
    ).resolves.toEqual([]);
    expect(blobGet).toHaveBeenCalledOnce();
  });

  it("does not hide a non-production alert cache configuration error", async () => {
    vi.stubGlobal("Netlify", {
      context: { deploy: { context: "deploy-preview" } },
      env: {
        get: (name: string) =>
          ({
            NEXT_PUBLIC_SUPABASE_URL:
              "https://bxelrhklsznmpksgrqep.supabase.co",
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
            REMOTIVE_SOURCE_ENABLED: "true",
          })[name],
      },
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockImplementation(async (input) =>
          Response.json(
            String(input).includes("/rest/v1/jobs?") ? [] : [activePolicy],
          ),
        ),
    );

    await expect(
      fetchAlertJobCatalog(new AbortController().signal),
    ).rejects.toMatchObject({ code: "alert_catalog_production_only" });
    expect(blobGet).not.toHaveBeenCalled();
  });

  it("does not follow redirects on fixed Supabase catalog reads", async () => {
    vi.stubGlobal("Netlify", {
      env: {
        get: (name: string) =>
          ({
            NEXT_PUBLIC_SUPABASE_URL:
              "https://bxelrhklsznmpksgrqep.supabase.co",
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
            REMOTIVE_SOURCE_ENABLED: "true",
          })[name],
      },
    });
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json([]));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      fetchAlertJobCatalog(new AbortController().signal),
    ).resolves.toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchSpy.mock.calls) {
      expect(String(url)).toMatch(
        /^https:\/\/bxelrhklsznmpksgrqep\.supabase\.co\/rest\/v1\/(jobs|job_sources)/,
      );
      expect(init).toMatchObject({
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
      });
      expect(new Headers(init?.headers).get("apikey")).toBe(
        "test-publishable-key",
      );
    }
  });
});
