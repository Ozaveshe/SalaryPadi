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
  const execution = {
    signal: new AbortController().signal,
    remainingMs: () => 20_000,
  } as WorkerExecution;
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

it.each(["success", "provider-failure", "budget"])(
  "isolates three country digests and retries a provider failure: %s",
  async (scenario) => {
    const failKenya = scenario === "provider-failure";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-23T04:00:00Z"));
    stubWorkerEnvironment({
      EMAIL_PROVIDER: "resend",
      REMOTIVE_SOURCE_ENABLED: "false",
      RESEND_API_KEY: "re_test_12345678901234567890",
      TRANSACTIONAL_EMAIL_FROM: "SalaryPadi <alerts@salarypadi.com>",
      TRANSACTIONAL_EMAIL_REPLY_TO: "support@salarypadi.com",
    });
    const countries = ["GH", "KE", "ZA"];
    const names = ["Ghana", "Kenya", "South Africa"];
    const claims = countries.map((code, i) => ({
      delivery_id: `00000000-0000-4000-8000-00000000000${i + 1}`,
      claim_token: `00000000-0000-4000-8000-00000000001${i + 1}`,
      alert_id: `00000000-0000-4000-8000-00000000002${i + 1}`,
      recipient_email: "reader@example.test",
      search_spec: {
        schema_version: 1,
        applicantCountry: code,
        eligibility: "nigeria",
      },
      cadence: "daily",
      last_sent_at: null,
    }));
    const jobs = names.map((name, i) => {
      const job = normalizeRemotiveJob(
        {
          id: i + 1,
          title: `${name} engineer`,
          company_name: "Fixture employer",
          company_logo: "",
          url: `https://remotive.com/remote-jobs/engineering/${i + 1}-engineer`,
          category: "Engineering",
          tags: [],
          job_type: "full_time",
          publication_date: "2026-10-22T04:00:00Z",
          candidate_required_location: name,
          salary: "",
          description: "<p>Source fixture</p>",
        },
        new Date().toISOString(),
      );
      return {
        ...job,
        applicationUrl: `https://jobicy.com/jobs/${i + 1}-engineer`,
        sourceUrl: `https://jobicy.com/jobs/${i + 1}-engineer`,
        source: { ...JOBICY_SOURCE_POLICY, canEmail: true },
      };
    });
    blobs.get.mockResolvedValue(
      createAlertCatalog(jobs, new Date().toISOString()),
    );
    const fetchMock = installWorkerFetch({
      rpc: {
        worker_claim_alert_deliveries: claims,
        worker_alert_source_enabled: true,
        worker_read_alert_state: () => ({ sent_job_keys: [], prepared: null }),
        worker_prepare_alert: (body: Record<string, unknown>) => body.p_message,
        worker_complete_alert_with_jobs: true,
      },
      fallback: async (url, init) => {
        if (url.pathname === "/rest/v1/jobs") return Response.json([]);
        if (url.href === "https://api.resend.com/emails") {
          if (failKenya && String(init?.body).includes("matches for Kenya"))
            return new Response("", { status: 429 });
          // Singular subject for this one-role fixture.
          if (failKenya && String(init?.body).includes("match for Kenya"))
            return new Response("", { status: 429 });
          return Response.json({ id: "00000000-0000-4000-8000-000000000099" });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    });
    const result = runAlertDelivery({
      signal: new AbortController().signal,
      remainingMs: () => (scenario === "budget" ? 7_000 : 20_000),
    });
    if (failKenya || scenario === "budget")
      await expect(result).rejects.toMatchObject({
        code: "alert_delivery_partial_failure",
      });
    else
      await expect(result).resolves.toMatchObject({
        summary: { claimed: 3, sent: 3, failed: 0 },
      });
    const emails = fetchMock.mock.calls.filter(
      ([url]) => String(url) === "https://api.resend.com/emails",
    );
    expect(emails).toHaveLength(scenario === "budget" ? 0 : 3);
    for (const [i, call] of emails.entries()) {
      const body = JSON.parse(String(call[1]?.body));
      expect(body.subject).toBe(`1 new SalaryPadi job match for ${names[i]}`);
      expect(body.text).toContain(`applicantCountry=${countries[i]}`);
      for (const other of names.filter((name) => name !== names[i]))
        expect(body.text).not.toContain(`${other} engineer`);
    }
    const completed = rpcCallBodies(
      fetchMock,
      "worker_complete_alert_with_jobs",
    );
    expect(completed.map((value) => value.p_outcome)).toEqual(
      scenario === "budget"
        ? ["failed", "failed", "failed"]
        : failKenya
          ? ["sent", "failed", "sent"]
          : ["sent", "sent", "sent"],
    );
  },
);
