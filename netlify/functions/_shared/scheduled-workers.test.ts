import { afterEach, describe, expect, it, vi } from "vitest";

const blobMocks = vi.hoisted(() => ({
  get: vi.fn(),
  setJSON: vi.fn(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({ get: blobMocks.get, setJSON: blobMocks.setJSON }),
}));

import type { RemotiveJob } from "../../../src/lib/jobs/remotive-schema";
import { normalizeRemotiveJob } from "../../../src/lib/jobs/normalize";
import {
  REMOTIVE_REQUIRED_DESTINATION_KIND,
  REMOTIVE_SOURCE_POLICY,
  REMOTIVE_TERMS_VERSION,
} from "../../../src/lib/jobs/source-policy";
import afroToolsCatalogSync from "../afrotools-catalog-sync.mjs";
import alertDelivery from "../alert-delivery.mjs";
import atsSourceSync from "../ats-source-sync.mjs";
import currencyRates from "../currency-rates";
import jobSourceSync from "../job-source-sync.mjs";
import operationsMaintenance from "../operations-maintenance";
import { createAlertCatalog } from "./jobs";
import {
  installWorkerFetch,
  nonBookkeepingUrls,
  rpcCallBodies,
  scheduledRequest,
  stubWorkerEnvironment,
  workerContext,
  type ScheduledHandler,
} from "./test-support/scheduled-worker";

const sourceJob: RemotiveJob = {
  id: 42,
  url: "https://remotive.com/remote-jobs/software-dev/example-42",
  title: "Senior Platform Engineer",
  company_name: "Example Ltd",
  company_logo: "",
  category: "Software Development",
  tags: ["TypeScript"],
  job_type: "full_time",
  publication_date: "2026-07-13T09:00:00Z",
  candidate_required_location: "Worldwide",
  salary: "$70,000-$90,000",
  description: "<p>Provider description remains outside durable storage.</p>",
};

function remotivePolicy() {
  return [
    {
      adapter_key: "remotive",
      source_type: REMOTIVE_SOURCE_POLICY.type,
      status: "active",
      terms_url: REMOTIVE_SOURCE_POLICY.termsUrl,
      terms_reviewed_at: "2026-07-10T00:00:00.000Z",
      terms_version: REMOTIVE_TERMS_VERSION,
      allow_public_listing: true,
      attribution_required: true,
      may_store_full_description: false,
      may_index_jobs: false,
      may_emit_jobposting_schema: false,
      required_destination_kind: REMOTIVE_REQUIRED_DESTINATION_KIND,
      refresh_interval_seconds: 43_200,
    },
  ];
}

function atsPolicy() {
  return {
    source_id: "10000000-0000-4000-8000-000000000011",
    company_id: "20000000-0000-4000-8000-000000000011",
    adapter_key: "employer_ats_example",
    source_name: "Example careers",
    employer_name: "Example Nigeria",
    provider: "greenhouse",
    provider_region: null,
    tenant_identifier: "example",
    allowed_destination_hosts: ["boards.greenhouse.io"],
    allowed_destination_path_prefixes: ["/example"],
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
  };
}

function currencyPayload() {
  const required = [
    ["EUR", 1],
    ["NGN", 1562.4],
    ["GHS", 12.8355],
    ["KES", 147.365],
    ["ZAR", 18.7233],
    ["USD", 1.1406],
    ["GBP", 0.86215],
  ] as const;
  const extras = Array.from({ length: 13 }, (_, index) => ({
    isoA3Code: `AA${String.fromCharCode(65 + index)}`,
    value: index + 2,
  }));
  return [
    ...required.map(([isoA3Code, value]) => ({ isoA3Code, value })),
    ...extras,
  ];
}

function afroToolsPayload() {
  const attribution = {
    required: true,
    text: "Powered by AfroTools",
    url: "https://afrotools.com/tools/",
  };
  const tools = Array.from({ length: 10 }, (_, index) => ({
    schemaVersion: "1.0.0",
    id: `career-tool-${index + 1}`,
    name: `Career tool ${index + 1}`,
    description: `Published career tool ${index + 1}.`,
    category: "career",
    published: true,
    priority: 100 - index,
    integrationMode: "link",
    canonicalUrl: `https://afrotools.com/tools/career-tool-${index + 1}/`,
    countries: ["ALL"],
    api: null,
    widget: null,
    inputSchema: null,
    outputSchema: null,
    rulesVersion: null,
    lastVerified: "2026-07-13",
    disclaimer: "Verify the source before relying on this reference.",
    attribution,
  }));
  return {
    schemaVersion: "1.0.0",
    product: "salarypadi",
    category: "career",
    publishedAt: "2026-07-13",
    lastVerified: "2026-07-13",
    count: tools.length,
    tools,
    supportingApis: [],
    contract: {
      schema: "https://afrotools.com/schemas/catalog.json",
      documentation: "https://afrotools.com/docs/catalog/",
      attribution: "Powered by AfroTools",
    },
  };
}

function finishBody(fetchMock: ReturnType<typeof installWorkerFetch>) {
  const bodies = rpcCallBodies(fetchMock, "worker_finish");
  expect(bodies).toHaveLength(1);
  return bodies[0];
}

afterEach(() => {
  blobMocks.get.mockReset();
  blobMocks.setJSON.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("scheduled worker emergency controls", () => {
  const gatedWorkers: Array<{
    task: string;
    handler: ScheduledHandler;
    environment: Record<string, string>;
    reason: string;
  }> = [
    {
      task: "job_source_sync",
      handler: jobSourceSync,
      environment: { REMOTIVE_SOURCE_ENABLED: "false" },
      reason: "remotive_source_disabled",
    },
    {
      task: "alert_delivery",
      handler: alertDelivery,
      environment: { EMAIL_PROVIDER: "none" },
      reason: "email_provider_disabled",
    },
    {
      task: "ats_source_sync",
      handler: atsSourceSync,
      environment: { ATS_SOURCE_SYNC_ENABLED: "false" },
      reason: "ats_source_sync_disabled",
    },
    {
      task: "currency_rates",
      handler: currencyRates,
      environment: { CURRENCY_RATE_PROVIDER: "none" },
      reason: "currency_provider_disabled",
    },
  ];

  it.each(gatedWorkers)(
    "$task records a safe skip without a data or provider call",
    async ({ task, handler, environment, reason }) => {
      stubWorkerEnvironment(environment);
      const fetchMock = installWorkerFetch();

      const response = await handler(scheduledRequest(task), workerContext);

      expect(response.status).toBe(200);
      expect(nonBookkeepingUrls(fetchMock)).toEqual([]);
      expect(finishBody(fetchMock)).toMatchObject({
        p_status: "skipped",
        p_summary: { reason },
        p_error_code: null,
      });
    },
  );
});

describe("scheduled worker deduplication", () => {
  const workers: Array<[string, ScheduledHandler]> = [
    ["job_source_sync", jobSourceSync],
    ["alert_delivery", alertDelivery],
    ["ats_source_sync", atsSourceSync],
    ["afrotools_catalog_sync", afroToolsCatalogSync],
    ["currency_rates", currencyRates],
    ["operations_maintenance", operationsMaintenance],
  ];

  it.each(workers)(
    "%s returns 204 before its operation runs",
    async (task, handler) => {
      stubWorkerEnvironment();
      const fetchMock = installWorkerFetch({ shouldRun: false });

      const response = await handler(scheduledRequest(task), workerContext);

      expect(response.status).toBe(204);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(rpcCallBodies(fetchMock, "worker_start")).toHaveLength(1);
      expect(rpcCallBodies(fetchMock, "worker_finish")).toEqual([]);
    },
  );
});

describe("scheduled worker successful runs", () => {
  it("finishes a Remotive sync with the redacted catalog count", async () => {
    stubWorkerEnvironment({ REMOTIVE_SOURCE_ENABLED: "true" });
    blobMocks.setJSON.mockResolvedValue(undefined);
    const checkedAt = new Date().toISOString();
    const catalog = createAlertCatalog(
      [normalizeRemotiveJob(sourceJob, checkedAt)],
      checkedAt,
    );
    const fetchMock = installWorkerFetch({
      rpc: {
        worker_get_job_source_policy: remotivePolicy(),
        worker_record_source_import: "30000000-0000-4000-8000-000000000011",
      },
      fallback: (url) => {
        if (url.pathname === "/api/internal/job-source-snapshot") {
          return Response.json(catalog);
        }
        throw new Error(`Unexpected Remotive sync request: ${url}`);
      },
    });

    await expect(
      jobSourceSync(scheduledRequest("job_source_sync"), workerContext),
    ).resolves.toHaveProperty("status", 200);
    expect(blobMocks.setJSON).toHaveBeenCalledOnce();
    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "succeeded",
      p_summary: {
        source: "remotive",
        fetched_count: 1,
        alert_catalog_count: 1,
        persisted_descriptions: 0,
        import_recorded: true,
      },
      p_error_code: null,
    });
  });

  it("finishes alert delivery when there are no due claims", async () => {
    stubWorkerEnvironment({ EMAIL_PROVIDER: "resend" });
    const fetchMock = installWorkerFetch({
      rpc: { worker_claim_alert_deliveries: [] },
    });

    await alertDelivery(scheduledRequest("alert_delivery"), workerContext);

    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "succeeded",
      p_summary: { claimed: 0, sent: 0, skipped: 0, failed: 0 },
      p_error_code: null,
    });
  });

  it("finishes an authorized empty ATS snapshot", async () => {
    stubWorkerEnvironment({ ATS_SOURCE_SYNC_ENABLED: "true" });
    const policy = atsPolicy();
    const fetchMock = installWorkerFetch({
      rpc: {
        worker_list_authorized_ats_sources: [policy],
        worker_claim_authorized_ats_source: { claimed: true, policy },
        worker_begin_ats_snapshot: [
          {
            import_run_id: "40000000-0000-4000-8000-000000000011",
            should_run: true,
          },
        ],
        worker_finalize_ats_snapshot: { stored_count: 0 },
      },
      fallback: (url) => {
        if (url.hostname === "boards-api.greenhouse.io") {
          return Response.json({ jobs: [], meta: { total: 0 } });
        }
        throw new Error(`Unexpected ATS request: ${url}`);
      },
    });

    await atsSourceSync(scheduledRequest("ats_source_sync"), workerContext);

    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "succeeded",
      p_summary: {
        configured_sources: 1,
        claimed_sources: 1,
        completed_sources: 1,
        duplicate_sources: 0,
        partial_sources: 0,
        failed_sources: 0,
        provider_records: 0,
        stored_records: 0,
        quarantined_records: 0,
      },
      p_error_code: null,
    });
  });

  it("stores a validated AfroTools catalog snapshot", async () => {
    stubWorkerEnvironment();
    blobMocks.get.mockRejectedValue(new Error("cold start"));
    blobMocks.setJSON.mockResolvedValue(undefined);
    const quote = String.fromCharCode(34);
    const etag = `${quote}sha256-${"A".repeat(43)}${quote}`;
    const fetchMock = installWorkerFetch({
      fallback: (url) => {
        if (url.hostname === "afrotools.com") {
          return Response.json(afroToolsPayload(), {
            headers: { "x-afrotools-catalog-etag": etag },
          });
        }
        throw new Error(`Unexpected AfroTools request: ${url}`);
      },
    });

    await afroToolsCatalogSync(
      scheduledRequest("afrotools_catalog_sync"),
      workerContext,
    );

    expect(blobMocks.setJSON).toHaveBeenCalledOnce();
    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "succeeded",
      p_summary: {
        source:
          "https://afrotools.com/api/v1/catalog/tools?product=salarypadi&category=career",
        schema_version: "1.0.0",
        catalog_last_updated: "2026-07-13",
        tool_count: 10,
        source_http_status: 200,
        etag_revalidated: false,
        etag_source: "afrotools",
      },
      p_error_code: null,
    });
  });

  it("stores the provider currency rate set", async () => {
    stubWorkerEnvironment({
      CURRENCY_RATE_PROVIDER: "european_commission_inforeuro",
    });
    const fetchMock = installWorkerFetch({
      rpc: { worker_store_inforeuro_rates: "rate-set-id" },
      fallback: (url) => {
        if (url.hostname === "ec.europa.eu") {
          return Response.json(currencyPayload());
        }
        throw new Error(`Unexpected currency request: ${url}`);
      },
    });

    await currencyRates(scheduledRequest("currency_rates"), workerContext);

    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "succeeded",
      p_summary: {
        provider: "european_commission_inforeuro",
        rate_count: 42,
        rate_set_recorded: true,
      },
      p_error_code: null,
    });
  });

  it("finishes operations maintenance with the RPC summary", async () => {
    stubWorkerEnvironment();
    const fetchMock = installWorkerFetch({
      rpc: { worker_run_maintenance: { cleaned: 3 } },
    });

    await operationsMaintenance(
      scheduledRequest("operations_maintenance"),
      workerContext,
    );

    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "succeeded",
      p_summary: { cleaned: 3 },
      p_error_code: null,
    });
  });
});

describe("scheduled worker failures", () => {
  it("records the Remotive source policy RPC failure", async () => {
    stubWorkerEnvironment({ REMOTIVE_SOURCE_ENABLED: "true" });
    const fetchMock = installWorkerFetch({
      rpc: {
        worker_get_job_source_policy: new Response(null, { status: 503 }),
        worker_record_source_import: true,
      },
    });

    await expect(
      jobSourceSync(scheduledRequest("job_source_sync"), workerContext),
    ).rejects.toMatchObject({ code: "supabase_rpc_503" });
    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "failed",
      p_error_code: "supabase_rpc_503",
    });
  });

  it("records an alert claim RPC failure", async () => {
    stubWorkerEnvironment({ EMAIL_PROVIDER: "resend" });
    const fetchMock = installWorkerFetch({
      rpc: {
        worker_claim_alert_deliveries: new Response(null, { status: 503 }),
      },
    });

    await expect(
      alertDelivery(scheduledRequest("alert_delivery"), workerContext),
    ).rejects.toMatchObject({ code: "supabase_rpc_503" });
    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "failed",
      p_error_code: "supabase_rpc_503",
    });
  });

  it("records an ATS policy-list RPC failure", async () => {
    stubWorkerEnvironment({ ATS_SOURCE_SYNC_ENABLED: "true" });
    const fetchMock = installWorkerFetch({
      rpc: {
        worker_list_authorized_ats_sources: new Response(null, { status: 503 }),
      },
    });

    await expect(
      atsSourceSync(scheduledRequest("ats_source_sync"), workerContext),
    ).rejects.toMatchObject({ code: "supabase_rpc_503" });
    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "failed",
      p_error_code: "supabase_rpc_503",
    });
  });

  it("records an AfroTools provider failure", async () => {
    stubWorkerEnvironment();
    blobMocks.get.mockRejectedValue(new Error("cold start"));
    const fetchMock = installWorkerFetch({
      fallback: () => new Response(null, { status: 503 }),
    });

    await expect(
      afroToolsCatalogSync(
        scheduledRequest("afrotools_catalog_sync"),
        workerContext,
      ),
    ).rejects.toThrow("AfroTools catalog returned HTTP 503");
    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "failed",
      p_error_code: "worker_failed",
    });
  });

  it("records a currency provider failure", async () => {
    stubWorkerEnvironment({
      CURRENCY_RATE_PROVIDER: "european_commission_inforeuro",
    });
    const fetchMock = installWorkerFetch({
      fallback: () => new Response(null, { status: 503 }),
    });

    await expect(
      currencyRates(scheduledRequest("currency_rates"), workerContext),
    ).rejects.toMatchObject({ code: "currency_source_503" });
    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "failed",
      p_error_code: "currency_source_503",
    });
  });

  it("records an operations maintenance RPC failure", async () => {
    stubWorkerEnvironment();
    const fetchMock = installWorkerFetch({
      rpc: {
        worker_run_maintenance: new Response(null, { status: 503 }),
      },
    });

    await expect(
      operationsMaintenance(
        scheduledRequest("operations_maintenance"),
        workerContext,
      ),
    ).rejects.toMatchObject({ code: "supabase_rpc_503" });
    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "failed",
      p_error_code: "supabase_rpc_503",
    });
  });
});
