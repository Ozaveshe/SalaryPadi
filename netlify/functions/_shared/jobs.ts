import { getStore } from "@netlify/blobs";
import { z } from "zod";

import { readBoundedJson } from "../../../src/lib/http/json";
import { mapDatabaseJobRow } from "../../../src/lib/jobs/database";
import { REMOTIVE_ADAPTER_ERROR_CODES } from "../../../src/lib/jobs/remotive-adapter";
import {
  REMOTIVE_ADAPTER_KEY,
  REMOTIVE_REQUIRED_DESTINATION_KIND,
  REMOTIVE_SOURCE_POLICY,
  REMOTIVE_TERMS_VERSION,
} from "../../../src/lib/jobs/source-policy";
import {
  filterAndSortJobs,
  parseJobSearch,
} from "../../../src/lib/jobs/search";
import type { Job } from "../../../src/lib/jobs/types";

import {
  alertCatalogSchema,
  createAlertCatalog,
  type AlertCatalog,
} from "./job-catalog-schema";
import {
  boundedSignal,
  EXTERNAL_REQUEST_TIMEOUT_MS,
  getRuntimeAppOrigin,
  getRuntimeBoolean,
  getRuntimeEnvironment,
  getRuntimeSecret,
  getRuntimeSupabaseOrigin,
  OperationalError,
  raceWithSignal,
} from "./runtime";

const ALERT_CATALOG_STORE = "salarypadi-job-catalog";
const ALERT_CATALOG_KEY = "current";
const ALERT_CATALOG_MAX_AGE_MS = 14 * 60 * 60 * 1000;
const ALERT_CATALOG_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const ALERT_CATALOG_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const JOB_SNAPSHOT_REQUEST_TIMEOUT_MS = 15_000;
const SOURCE_POLICY_MAX_RESPONSE_BYTES = 32 * 1024;
const DATABASE_JOBS_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const RECOVERABLE_ALERT_CATALOG_ERRORS = new Set([
  "alert_catalog_missing",
  "alert_catalog_shape",
  "alert_catalog_future",
  "alert_catalog_stale",
]);

const publicRemotivePolicySchema = z
  .array(
    z
      .object({
        adapter_key: z.literal(REMOTIVE_ADAPTER_KEY),
        source_type: z.literal(REMOTIVE_SOURCE_POLICY.type),
        terms_url: z.literal(REMOTIVE_SOURCE_POLICY.termsUrl),
        terms_reviewed_at: z.string().datetime({ offset: true }),
        terms_version: z.literal(REMOTIVE_TERMS_VERSION),
        attribution_required: z.literal(true),
        may_store_full_description: z.literal(
          REMOTIVE_SOURCE_POLICY.canStoreFullDescription,
        ),
        may_index_jobs: z.literal(REMOTIVE_SOURCE_POLICY.canIndex),
        may_emit_jobposting_schema: z.literal(
          REMOTIVE_SOURCE_POLICY.canUseJobPostingStructuredData,
        ),
        allow_public_listing: z.literal(true),
        required_destination_kind: z.literal(
          REMOTIVE_REQUIRED_DESTINATION_KIND,
        ),
        refresh_interval_seconds: z.literal(
          REMOTIVE_SOURCE_POLICY.refreshIntervalSeconds,
        ),
      })
      .strict(),
  )
  .max(1);
const jobSnapshotErrorSchema = z
  .object({
    error: z.enum([
      ...REMOTIVE_ADAPTER_ERROR_CODES,
      "remotive_adapter_failed",
      "remotive_environment_disabled",
      "remotive_policy_disabled",
      "remotive_policy_mismatch",
      "remotive_snapshot_stale",
      "remotive_snapshot_future",
      "source_registry_unconfigured",
      "source_registry_query_failed",
      "job_source_unavailable",
      "job_source_snapshot_failed",
    ]),
    source_state: z
      .enum(["live", "degraded", "disabled", "unavailable"])
      .optional(),
  })
  .strict();

export type AlertClaim = {
  delivery_id: string;
  claim_token: string;
  alert_id: string;
  recipient_email: string;
  search_spec: Record<string, unknown>;
  cadence: "daily" | "weekly";
  last_sent_at: string | null;
};

export async function fetchPublishedRemotiveSnapshot(
  signal?: AbortSignal,
): Promise<AlertCatalog> {
  const endpoint = new URL(
    "/api/internal/job-source-snapshot",
    getRuntimeAppOrigin(),
  );
  const sourceSyncToken = getRuntimeSecret("JOB_SOURCE_SYNC_TOKEN");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${sourceSyncToken}`,
    },
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    signal: boundedSignal(signal, JOB_SNAPSHOT_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    if (
      response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase() === "application/json"
    ) {
      try {
        const errorPayload = await readBoundedJson(
          response,
          SOURCE_POLICY_MAX_RESPONSE_BYTES,
        );
        const parsedError = jobSnapshotErrorSchema.safeParse(errorPayload);
        if (parsedError.success) {
          throw new OperationalError(parsedError.data.error);
        }
      } catch (reason) {
        if (reason instanceof OperationalError) throw reason;
      }
    }
    throw new OperationalError(`job_snapshot_${response.status}`);
  }
  if (
    response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "application/json"
  ) {
    throw new OperationalError("job_snapshot_content_type");
  }

  let payload: unknown;
  try {
    payload = await readBoundedJson(response, ALERT_CATALOG_MAX_RESPONSE_BYTES);
  } catch {
    throw new OperationalError("job_snapshot_invalid_json");
  }
  const parsed = alertCatalogSchema.safeParse(payload);
  if (!parsed.success) throw new OperationalError("job_snapshot_shape");
  parseAlertCatalog(parsed.data);
  return parsed.data;
}

function alertCatalogStore() {
  const netlify = (
    globalThis as typeof globalThis & {
      Netlify?: { context?: { deploy?: { context?: string } } };
    }
  ).Netlify;
  if (netlify?.context?.deploy?.context !== "production") {
    throw new OperationalError("alert_catalog_production_only");
  }
  return getStore({ name: ALERT_CATALOG_STORE, consistency: "strong" });
}

export { createAlertCatalog };

export function parseAlertCatalog(value: unknown, now = new Date()): Job[] {
  if (!value || typeof value !== "object") {
    throw new OperationalError("alert_catalog_missing");
  }
  const parsed = alertCatalogSchema.safeParse(value);
  if (!parsed.success) {
    throw new OperationalError("alert_catalog_shape");
  }
  const checkedAt = Date.parse(parsed.data.checkedAt);
  const ageMs = now.valueOf() - checkedAt;
  if (ageMs < -ALERT_CATALOG_MAX_FUTURE_SKEW_MS) {
    throw new OperationalError("alert_catalog_future");
  }
  if (ageMs > ALERT_CATALOG_MAX_AGE_MS) {
    throw new OperationalError("alert_catalog_stale");
  }
  return parsed.data.jobs;
}

export function parseRemotivePublicationEnabled(value: unknown): boolean {
  const parsed = publicRemotivePolicySchema.safeParse(value);
  if (!parsed.success) {
    throw new OperationalError("remotive_public_policy_shape");
  }
  return parsed.data.length === 1;
}

export async function storeAlertJobCatalog(
  jobs: Job[],
  signal: AbortSignal,
  checkedAt = jobs[0]?.lastCheckedAt ?? new Date().toISOString(),
): Promise<number> {
  const catalog = createAlertCatalog(jobs, checkedAt);
  await raceWithSignal(
    alertCatalogStore().setJSON(ALERT_CATALOG_KEY, catalog),
    signal,
  );
  return catalog.jobs.length;
}

async function fetchDatabaseJobs(signal: AbortSignal): Promise<Job[]> {
  const url = getRuntimeSupabaseOrigin();
  const publishableKey = getRuntimeEnvironment(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
  const response = await fetch(
    `${url}/rest/v1/jobs?select=*&order=posted_at.desc&limit=500`,
    {
      headers: {
        Accept: "application/json",
        "Accept-Profile": "api",
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
      },
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: boundedSignal(signal, EXTERNAL_REQUEST_TIMEOUT_MS),
    },
  );
  if (!response.ok)
    throw new OperationalError(`database_jobs_${response.status}`);
  let payload: unknown;
  try {
    payload = await readBoundedJson(response, DATABASE_JOBS_MAX_RESPONSE_BYTES);
  } catch {
    throw new OperationalError("database_jobs_invalid_json");
  }
  if (!Array.isArray(payload))
    throw new OperationalError("database_jobs_shape");
  return payload
    .map((row) => mapDatabaseJobRow(row))
    .filter((job): job is Job => job !== null);
}

async function fetchRemotivePublicationEnabled(
  signal: AbortSignal,
): Promise<boolean> {
  if (!getRuntimeBoolean("REMOTIVE_SOURCE_ENABLED", false)) return false;
  const url = new URL("/rest/v1/job_sources", getRuntimeSupabaseOrigin());
  url.searchParams.set(
    "select",
    [
      "adapter_key",
      "source_type",
      "terms_url",
      "terms_reviewed_at",
      "terms_version",
      "attribution_required",
      "may_store_full_description",
      "may_index_jobs",
      "may_emit_jobposting_schema",
      "allow_public_listing",
      "required_destination_kind",
      "refresh_interval_seconds",
    ].join(","),
  );
  url.searchParams.set("adapter_key", `eq.${REMOTIVE_ADAPTER_KEY}`);
  url.searchParams.set("limit", "1");
  const publishableKey = getRuntimeEnvironment(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Profile": "api",
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
    },
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    signal: boundedSignal(signal, EXTERNAL_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new OperationalError(`remotive_public_policy_${response.status}`);
  }
  let payload: unknown;
  try {
    payload = await readBoundedJson(response, SOURCE_POLICY_MAX_RESPONSE_BYTES);
  } catch {
    throw new OperationalError("remotive_public_policy_json");
  }
  return parseRemotivePublicationEnabled(payload);
}

export async function assertAlertJobsPublishable(
  jobs: Job[],
  signal: AbortSignal,
): Promise<void> {
  const containsRemotive = jobs.some(
    (job) => job.source.id === REMOTIVE_SOURCE_POLICY.id,
  );
  if (!containsRemotive) return;
  if (!(await fetchRemotivePublicationEnabled(signal))) {
    throw new OperationalError("remotive_source_revoked");
  }
}

export async function fetchAlertJobCatalog(
  signal: AbortSignal,
): Promise<Job[]> {
  const [database, remotiveEnabled] = await Promise.all([
    fetchDatabaseJobs(signal),
    fetchRemotivePublicationEnabled(signal),
  ]);
  if (!remotiveEnabled) return database;
  let remotive: Job[];
  try {
    const stored = await raceWithSignal(
      alertCatalogStore().get(ALERT_CATALOG_KEY, { type: "json" }),
      signal,
    );
    remotive = parseAlertCatalog(stored);
  } catch (reason) {
    if (
      reason instanceof OperationalError &&
      RECOVERABLE_ALERT_CATALOG_ERRORS.has(reason.code)
    ) {
      // The canonical database remains the publication source of truth. A
      // missing or stale optional alert cache must not block editorial runs;
      // the independent source worker still records and alerts on its failure.
      return database;
    }
    throw reason;
  }
  const byFingerprint = new Map<string, Job>();
  for (const job of [...database, ...remotive]) {
    if (!byFingerprint.has(job.fingerprint))
      byFingerprint.set(job.fingerprint, job);
  }
  return [...byFingerprint.values()];
}

export function matchAlertJobs(
  claim: AlertClaim,
  jobs: Job[],
  now = new Date(),
): Job[] {
  const search = parseJobSearch(claim.search_spec);
  const cadenceWindow = claim.cadence === "weekly" ? 7 : 1;
  const cadenceCutoff = now.valueOf() - cadenceWindow * 86_400_000;
  const lastSent = claim.last_sent_at ? Date.parse(claim.last_sent_at) : 0;
  const cutoff = Math.max(cadenceCutoff, Number.isNaN(lastSent) ? 0 : lastSent);
  // Every source must opt in independently to private email distribution.
  // Public listing permission, provider reachability, or an employer source
  // type never implies permission to place a job in alerts.
  const emailPermittedJobs = jobs.filter((job) => job.source.canEmail === true);
  return filterAndSortJobs(emailPermittedJobs, search)
    .filter((job) => Date.parse(job.postedAt) > cutoff)
    .slice(0, 10);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderAlertEmail(jobs: Job[]) {
  const origin = getRuntimeEnvironment("NEXT_PUBLIC_APP_URL");
  const subject = `${jobs.length} new SalaryPadi job ${jobs.length === 1 ? "match" : "matches"}`;
  const rows = jobs.map((job) => {
    const detailUrl = new URL(
      `/jobs/${encodeURIComponent(job.id)}`,
      origin,
    ).toString();
    return {
      text: `${job.title} at ${job.company.name} - ${job.locationDisplay}\n${detailUrl}`,
      html: `<li style="margin:0 0 16px"><strong>${escapeHtml(job.title)}</strong><br>${escapeHtml(job.company.name)} - ${escapeHtml(job.locationDisplay)}<br><a href="${escapeHtml(detailUrl)}">Check eligibility and source evidence</a></li>`,
    };
  });
  const alertsUrl = new URL("/alerts", origin).toString();
  return {
    subject,
    text: `${subject}\n\n${rows.map((row) => row.text).join("\n\n")}\n\nManage alerts: ${alertsUrl}\n\nReference-only career information. Verify every role with the original source before applying.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#17211b"><h1 style="font-size:22px">${escapeHtml(subject)}</h1><p>These roles match your private SalaryPadi alert.</p><ul style="padding-left:20px">${rows.map((row) => row.html).join("")}</ul><p><a href="${escapeHtml(alertsUrl)}">Manage your alerts</a></p><p style="font-size:13px;color:#526057">Reference-only career information. Verify every role with the original source before applying.</p></div>`,
  };
}

export async function sendAlertEmail(
  deliveryId: string,
  recipient: string,
  email: ReturnType<typeof renderAlertEmail>,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = getRuntimeEnvironment("RESEND_API_KEY");
  const from = getRuntimeEnvironment("TRANSACTIONAL_EMAIL_FROM");
  const replyTo = getRuntimeEnvironment("TRANSACTIONAL_EMAIL_REPLY_TO");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": `salarypadi-alert-${deliveryId}`,
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      reply_to: replyTo,
      subject: email.subject,
      text: email.text,
      html: email.html,
      headers: {
        "List-Unsubscribe": `<${new URL("/alerts", getRuntimeEnvironment("NEXT_PUBLIC_APP_URL"))}>`,
      },
    }),
    signal: boundedSignal(signal, EXTERNAL_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok)
    throw new OperationalError(`email_provider_${response.status}`);
  const payload = (await response.json()) as { id?: unknown };
  if (typeof payload.id !== "string")
    throw new OperationalError("email_provider_shape");
  return payload.id;
}
