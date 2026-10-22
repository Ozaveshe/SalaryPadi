import { afterEach, expect, it, vi } from "vitest";
const blobs = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@netlify/blobs", () => ({ getStore: () => ({ get: blobs.get }) }));
import { runAlertDelivery } from "../alert-delivery.mjs";
import { createAlertCatalog } from "./jobs";
import { normalizeRemotiveJob } from "../../../src/lib/jobs/normalize";
import { JOBICY_SOURCE_POLICY } from "../../../src/lib/jobs/source-policy";
import {
  installWorkerFetch,
  rpcCallBodies,
  stubWorkerEnvironment,
} from "./test-support/scheduled-worker";
import type { WorkerExecution } from "./runtime";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  blobs.get.mockReset();
});

it("delivers a country-matched secondary-feed job and reuses its exact email on retry", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));
  stubWorkerEnvironment({
    EMAIL_PROVIDER: "resend",
    REMOTIVE_SOURCE_ENABLED: "false",
    RESEND_API_KEY: "re_test_12345678901234567890",
    TRANSACTIONAL_EMAIL_FROM: "SalaryPadi <alerts@salarypadi.com>",
    TRANSACTIONAL_EMAIL_REPLY_TO: "support@salarypadi.com",
  });
  const job = normalizeRemotiveJob(
    {
      id: 42,
      url: "https://remotive.com/remote-jobs/engineering/42-engineer",
      title: "Engineer",
      company_name: "Example",
      company_logo: "",
      category: "Engineering",
      tags: [],
      job_type: "full_time",
      publication_date: "2026-10-18T12:00:00Z",
      candidate_required_location: "Worldwide",
      salary: "",
      description: "<p>Excluded from emails.</p>",
    },
    new Date().toISOString(),
  );
  job.sourceUrl = job.applicationUrl = "https://jobicy.com/jobs/42-engineer";
  job.source = { ...JOBICY_SOURCE_POLICY, canEmail: false }; // old stored snapshot
  const claim = {
    delivery_id: "00000000-0000-4000-8000-000000000001",
    claim_token: "00000000-0000-4000-8000-000000000002",
    alert_id: "00000000-0000-4000-8000-000000000003",
    recipient_email: "reader@example.test",
    search_spec: { schema_version: 1, applicantCountry: "NG" },
    cadence: "daily",
    last_sent_at: null,
  };
  blobs.get.mockResolvedValue(
    createAlertCatalog([job], new Date().toISOString()),
  );
  let prepared: unknown = null;
  const fetchMock = installWorkerFetch({
    rpc: {
      worker_claim_alert_deliveries: [claim],
      worker_alert_source_enabled: true,
      worker_read_alert_state: () => ({ sent_job_keys: [], prepared }),
      worker_prepare_alert: (body: Record<string, unknown>) => {
        prepared ??= body.p_message;
        return prepared;
      },
      worker_complete_alert_with_jobs: true,
    },
    fallback: async (url) => {
      if (url.pathname === "/rest/v1/jobs") return Response.json([]);
      if (url.href === "https://api.resend.com/emails")
        return Response.json({ id: "00000000-0000-4000-8000-000000000004" });
      throw new Error(`Unexpected request: ${url}`);
    },
  });
  const execution = { signal: new AbortController().signal } as WorkerExecution;
  await runAlertDelivery(execution);
  job.title = "Updated title after first attempt";
  blobs.get.mockResolvedValue(
    createAlertCatalog([job], new Date().toISOString()),
  );
  await runAlertDelivery(execution);
  const emails = fetchMock.mock.calls.filter(
    ([url]) => String(url) === "https://api.resend.com/emails",
  );
  expect(emails).toHaveLength(2);
  expect(emails[0]?.[1]?.body).toBe(emails[1]?.[1]?.body);
  const body = String(emails[0]?.[1]?.body);
  expect(body).toContain("Nigeria");
  expect(body).toContain("applicantCountry=NG");
  expect(body).toContain("Source: Jobicy");
  expect(body).not.toContain("Excluded from emails");
  expect(
    rpcCallBodies(fetchMock, "worker_complete_alert_with_jobs")[0],
  ).toMatchObject({ p_outcome: "sent", p_matched_job_count: 1 });
});
