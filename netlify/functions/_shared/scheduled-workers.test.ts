import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blobMocks = vi.hoisted(() => ({
  get: vi.fn(),
  setJSON: vi.fn(),
}));
const policyMocks = vi.hoisted(() => ({
  openSupplyAdapter: vi.fn(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({ get: blobMocks.get, setJSON: blobMocks.setJSON }),
}));
vi.mock("../../../src/lib/jobs/supply/adapters", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../src/lib/jobs/supply/adapters")
    >();
  return { ...actual, openSupplyAdapter: policyMocks.openSupplyAdapter };
});

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

beforeEach(() => {
  policyMocks.openSupplyAdapter.mockReset();
  policyMocks.openSupplyAdapter.mockReturnValue({
    policy: { adapterKey: "remotive" },
    endpoint: "https://remotive.com/api/remote-jobs",
  });
});

function remotivePolicy() {
  return [
    {
      adapter_key: "remotive",
      source_type: REMOTIVE_SOURCE_POLICY.type,
      status: "active",
      terms_url: REMOTIVE_SOURCE_POLICY.termsUrl,
      terms_reviewed_at: "2026-07-14T00:00:00.000Z",
      terms_version: REMOTIVE_TERMS_VERSION,
      allow_public_listing: true,
      attribution_required: true,
      may_store_full_description: false,
      may_index_jobs: false,
      may_emit_jobposting_schema: false,
      required_destination_kind: REMOTIVE_REQUIRED_DESTINATION_KIND,
      refresh_interval_seconds: 21_600,
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
        worker_claim_remotive_fetch: true,
        worker_record_source_import_v2: "30000000-0000-4000-8000-000000000011",
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

  it("fails closed when an alert claim contains an unknown search field", async () => {
    stubWorkerEnvironment({ EMAIL_PROVIDER: "resend" });
    const fetchMock = installWorkerFetch({
      rpc: {
        worker_claim_alert_deliveries: [
          {
            delivery_id: "00000000-0000-4000-8000-000000000061",
            claim_token: "00000000-0000-4000-8000-000000000062",
            alert_id: "00000000-0000-4000-8000-000000000063",
            recipient_email: "reader@example.test",
            search_spec: { schema_version: 1, unreviewed_filter: true },
            cadence: "daily",
            last_sent_at: null,
          },
        ],
      },
    });

    await expect(
      alertDelivery(scheduledRequest("alert_delivery"), workerContext),
    ).rejects.toMatchObject({ code: "alert_claim_contract_invalid" });
    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "failed",
      p_error_code: "alert_claim_contract_invalid",
    });
  });

  it("records a future alert watermark as a failed claim", async () => {
    stubWorkerEnvironment({
      EMAIL_PROVIDER: "resend",
      REMOTIVE_SOURCE_ENABLED: "false",
    });
    const fetchMock = installWorkerFetch({
      rpc: {
        worker_claim_alert_deliveries: [
          {
            delivery_id: "00000000-0000-4000-8000-000000000051",
            claim_token: "00000000-0000-4000-8000-000000000052",
            alert_id: "00000000-0000-4000-8000-000000000053",
            recipient_email: "reader@example.test",
            search_spec: { schema_version: 1 },
            cadence: "daily",
            last_sent_at: "2999-01-01T00:00:00.000Z",
          },
        ],
        worker_complete_alert_delivery: true,
      },
      fallback: (url) => {
        if (url.pathname === "/rest/v1/jobs") return Response.json([]);
        throw new Error(`Unexpected alert delivery request: ${url}`);
      },
    });

    await expect(
      alertDelivery(scheduledRequest("alert_delivery"), workerContext),
    ).rejects.toMatchObject({ code: "alert_delivery_partial_failure" });

    expect(
      rpcCallBodies(fetchMock, "worker_complete_alert_delivery"),
    ).toContainEqual(
      expect.objectContaining({
        p_outcome: "failed",
        p_error_code: "alert_claim_invalid_last_sent_at",
      }),
    );
    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "failed",
      p_summary: { claimed: 1, sent: 0, skipped: 0, failed: 1 },
      p_error_code: "alert_delivery_partial_failure",
    });
  });

  it("records a degraded alert catalog when database rows are quarantined", async () => {
    stubWorkerEnvironment({
      EMAIL_PROVIDER: "resend",
      REMOTIVE_SOURCE_ENABLED: "false",
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = installWorkerFetch({
      rpc: {
        worker_claim_alert_deliveries: [
          {
            delivery_id: "00000000-0000-4000-8000-000000000021",
            claim_token: "00000000-0000-4000-8000-000000000023",
            alert_id: "00000000-0000-4000-8000-000000000022",
            recipient_email: "reader@example.test",
            search_spec: { schema_version: 1 },
            cadence: "daily",
            last_sent_at: null,
          },
        ],
        worker_complete_alert_delivery: true,
      },
      fallback: (url) => {
        if (url.pathname === "/rest/v1/jobs") {
          return Response.json([{ title: 42 }]);
        }
        throw new Error(`Unexpected alert delivery request: ${url}`);
      },
    });

    await alertDelivery(scheduledRequest("alert_delivery"), workerContext);

    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "succeeded",
      p_summary: {
        claimed: 1,
        sent: 0,
        skipped: 1,
        failed: 0,
        catalog_state: "degraded",
        catalog_issue_codes: ["database_jobs_invalid_rows"],
        quarantined_job_count: 1,
      },
      p_error_code: null,
    });
    expect(warning).toHaveBeenCalledOnce();
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
        worker_finalize_ats_snapshot: {
          outcome: "complete",
          fetched_count: 0,
          expected_record_count: 0,
          filtered_count: 0,
          created_count: 0,
          updated_count: 0,
          unchanged_count: 0,
          expired_count: 0,
          error_count: 0,
        },
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
      rpc: {
        worker_store_inforeuro_rates: "50000000-0000-4000-8000-000000000001",
      },
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
        worker_record_source_import_v2: true,
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

  it("records a malformed alert claim as an unavailable RPC contract", async () => {
    stubWorkerEnvironment({ EMAIL_PROVIDER: "resend" });
    const fetchMock = installWorkerFetch({
      rpc: {
        worker_claim_alert_deliveries: [
          {
            delivery_id: "00000000-0000-4000-8000-000000000061",
            claim_token: "00000000-0000-4000-8000-000000000062",
            alert_id: "00000000-0000-4000-8000-000000000063",
            recipient_email: "reader@example.test",
            search_spec: {},
            cadence: "daily",
            last_sent_at: null,
          },
        ],
      },
    });

    await expect(
      alertDelivery(scheduledRequest("alert_delivery"), workerContext),
    ).rejects.toMatchObject({
      code: "alert_claim_contract_invalid",
    });
    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "failed",
      p_error_code: "alert_claim_contract_invalid",
    });
  });

  it("keeps catalog failure primary while exposing an unavailable claim completion", async () => {
    stubWorkerEnvironment({
      EMAIL_PROVIDER: "resend",
      REMOTIVE_SOURCE_ENABLED: "false",
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = installWorkerFetch({
      rpc: {
        worker_claim_alert_deliveries: [
          {
            delivery_id: "00000000-0000-4000-8000-000000000031",
            claim_token: "00000000-0000-4000-8000-000000000032",
            alert_id: "00000000-0000-4000-8000-000000000033",
            recipient_email: "reader@example.test",
            search_spec: { schema_version: 1 },
            cadence: "daily",
            last_sent_at: null,
          },
        ],
        worker_complete_alert_delivery: new Response(null, { status: 503 }),
      },
      fallback: (url) => {
        if (url.pathname === "/rest/v1/jobs") {
          return new Response(null, { status: 503 });
        }
        throw new Error(`Unexpected alert catalog request: ${url}`);
      },
    });

    await expect(
      alertDelivery(scheduledRequest("alert_delivery"), workerContext),
    ).rejects.toMatchObject({
      code: "database_jobs_503",
      summary: {
        claim_completion_state: "unavailable",
        secondary_failure_codes: ["supabase_rpc_503"],
      },
    });
    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "failed",
      p_summary: {
        claim_completion_state: "unavailable",
        secondary_failure_codes: ["supabase_rpc_503"],
      },
      p_error_code: "database_jobs_503",
    });
    expect(warning).toHaveBeenCalledOnce();
  });

  it("does not relabel a sent email when success completion is unavailable", async () => {
    stubWorkerEnvironment({
      EMAIL_PROVIDER: "resend",
      REMOTIVE_SOURCE_ENABLED: "true",
      RESEND_API_KEY: "re_test_key_12345678901234567890",
      TRANSACTIONAL_EMAIL_FROM: "SalaryPadi <alerts@salarypadi.com>",
      TRANSACTIONAL_EMAIL_REPLY_TO: "support@salarypadi.com",
    });
    const checkedAt = new Date().toISOString();
    const emailJob = normalizeRemotiveJob(
      { ...sourceJob, publication_date: checkedAt },
      checkedAt,
    );
    const catalog = createAlertCatalog(
      [
        {
          ...emailJob,
          source: { ...emailJob.source, canEmail: true },
        },
      ],
      checkedAt,
    );
    blobMocks.get.mockResolvedValue(catalog);
    const claim = {
      delivery_id: "00000000-0000-4000-8000-000000000041",
      claim_token: "00000000-0000-4000-8000-000000000042",
      alert_id: "00000000-0000-4000-8000-000000000043",
      recipient_email: "reader@example.test",
      search_spec: { schema_version: 1 },
      cadence: "daily",
      last_sent_at: null,
    };
    const fetchMock = installWorkerFetch({
      rpc: {
        worker_claim_alert_deliveries: [claim],
        worker_complete_alert_delivery: new Response(null, { status: 503 }),
      },
      fallback: (url) => {
        if (url.pathname === "/rest/v1/jobs") return Response.json([]);
        if (url.pathname === "/rest/v1/job_sources") {
          const policy = remotivePolicy()[0]!;
          const publicPolicy = Object.fromEntries(
            Object.entries(policy).filter(([key]) => key !== "status"),
          );
          return Response.json([publicPolicy]);
        }
        if (url.hostname === "api.resend.com") {
          return Response.json({
            id: "90000000-0000-4000-8000-000000000001",
          });
        }
        throw new Error(`Unexpected alert delivery request: ${url}`);
      },
    });

    await expect(
      alertDelivery(scheduledRequest("alert_delivery"), workerContext),
    ).rejects.toMatchObject({ code: "supabase_rpc_503" });

    expect(
      nonBookkeepingUrls(fetchMock).filter(
        (url) => new URL(url).hostname === "api.resend.com",
      ),
    ).toHaveLength(1);
    expect(rpcCallBodies(fetchMock, "worker_complete_alert_delivery")).toEqual([
      {
        p_delivery_id: claim.delivery_id,
        p_claim_token: claim.claim_token,
        p_outcome: "sent",
        p_matched_job_count: 1,
        p_provider_message_id: "90000000-0000-4000-8000-000000000001",
        p_error_code: null,
      },
    ]);
    expect(finishBody(fetchMock)).toMatchObject({
      p_status: "failed",
      p_error_code: "supabase_rpc_503",
    });
  });

  it("records a provider-rejected email as a retryable failed delivery", async () => {
    stubWorkerEnvironment({
      EMAIL_PROVIDER: "resend",
      REMOTIVE_SOURCE_ENABLED: "true",
      RESEND_API_KEY: "re_test_key_12345678901234567890",
      TRANSACTIONAL_EMAIL_FROM: "SalaryPadi <alerts@salarypadi.com>",
      TRANSACTIONAL_EMAIL_REPLY_TO: "support@salarypadi.com",
    });
    const checkedAt = new Date().toISOString();
    const emailJob = normalizeRemotiveJob(
      { ...sourceJob, publication_date: checkedAt },
      checkedAt,
    );
    blobMocks.get.mockResolvedValue(
      createAlertCatalog(
        [
          {
            ...emailJob,
            source: { ...emailJob.source, canEmail: true },
          },
        ],
        checkedAt,
      ),
    );
    const claim = {
      delivery_id: "00000000-0000-4000-8000-000000000051",
      claim_token: "00000000-0000-4000-8000-000000000052",
      alert_id: "00000000-0000-4000-8000-000000000053",
      recipient_email: "reader@example.test",
      search_spec: { schema_version: 1 },
      cadence: "daily",
      last_sent_at: null,
    };
    const fetchMock = installWorkerFetch({
      rpc: {
        worker_claim_alert_deliveries: [claim],
        worker_complete_alert_delivery: true,
      },
      fallback: (url) => {
        if (url.pathname === "/rest/v1/jobs") return Response.json([]);
        if (url.pathname === "/rest/v1/job_sources") {
          const policy = remotivePolicy()[0]!;
          return Response.json([
            Object.fromEntries(
              Object.entries(policy).filter(([key]) => key !== "status"),
            ),
          ]);
        }
        if (url.hostname === "api.resend.com") {
          return Response.json(
            { error: "provider unavailable" },
            { status: 503 },
          );
        }
        throw new Error(`Unexpected alert delivery request: ${url}`);
      },
    });

    await expect(
      alertDelivery(scheduledRequest("alert_delivery"), workerContext),
    ).rejects.toMatchObject({
      code: "alert_delivery_partial_failure",
      summary: {
        claimed: 1,
        sent: 0,
        skipped: 0,
        failed: 1,
        claim_completion_state: "recorded",
        secondary_failure_codes: [],
      },
    });
    expect(rpcCallBodies(fetchMock, "worker_complete_alert_delivery")).toEqual([
      {
        p_delivery_id: claim.delivery_id,
        p_claim_token: claim.claim_token,
        p_outcome: "failed",
        p_matched_job_count: 1,
        p_provider_message_id: null,
        p_error_code: "email_provider_503",
      },
    ]);
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
