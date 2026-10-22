import { getStore } from "@netlify/blobs";
import { z } from "zod";
import { readSecondaryFeedSnapshot } from "../../../src/lib/jobs/secondary-feed-store";
import { JOBICY_SOURCE_POLICY } from "../../../src/lib/jobs/source-policy";

import { discardResponseBody } from "../../../src/lib/http/body";
import { readBoundedJson } from "../../../src/lib/http/json";
import { decodeDatabaseJobRow } from "../../../src/lib/jobs/database";
import { buildJobFingerprint } from "../../../src/lib/jobs/fingerprint";
import { REMOTIVE_ADAPTER_ERROR_CODES } from "../../../src/lib/jobs/remotive-adapter";
import {
  REMOTIVE_ADAPTER_KEY,
  REMOTIVE_REQUIRED_DESTINATION_KIND,
  REMOTIVE_SOURCE_POLICY,
  REMOTIVE_TERMS_VERSION,
} from "../../../src/lib/jobs/source-policy";
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
  getRuntimeHeaderCredential,
  getRuntimeSecret,
  getRuntimeSupabaseOrigin,
  OperationalError,
  raceWithSignal,
  rpc,
  rpcBooleanResultSchema,
} from "./runtime";

const ALERT_CATALOG_STORE = "salarypadi-job-catalog";
const ALERT_CATALOG_KEY = "current";
const ALERT_CATALOG_MAX_AGE_MS = 14 * 60 * 60 * 1000;
const ALERT_CATALOG_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const ALERT_CATALOG_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const JOB_SNAPSHOT_REQUEST_TIMEOUT_MS = 15_000;
const SOURCE_POLICY_MAX_RESPONSE_BYTES = 32 * 1024;
const DATABASE_JOBS_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DATABASE_ALERT_PAGE_SIZE = 100;
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

export type AlertJobCatalogIssue = {
  code: string;
  count?: number;
};

export type AlertJobCatalogResult = {
  state: "ready" | "degraded";
  jobs: Job[];
  issues: AlertJobCatalogIssue[];
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
    await discardResponseBody(response);
    throw new OperationalError(`job_snapshot_${response.status}`);
  }
  if (
    response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "application/json"
  ) {
    await discardResponseBody(response);
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

async function fetchDatabaseJobs(
  signal: AbortSignal,
): Promise<AlertJobCatalogResult> {
  const url = getRuntimeSupabaseOrigin();
  const publishableKey = getRuntimeHeaderCredential(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
  const jobs: Job[] = [];
  let rejected = 0;
  let offset = 0;
  // Read every page, or fail the delivery for retry. Never send from a silently
  // truncated catalogue and advance the alert's delivery state.
  while (true) {
    const response = await fetch(
      `${url}/rest/v1/jobs?select=*&order=id.asc&limit=${DATABASE_ALERT_PAGE_SIZE}&offset=${offset}`,
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
    if (!response.ok) {
      await discardResponseBody(response);
      throw new OperationalError(`database_jobs_${response.status}`);
    }
    let payload: unknown;
    try {
      payload = await readBoundedJson(
        response,
        DATABASE_JOBS_MAX_RESPONSE_BYTES,
      );
    } catch {
      throw new OperationalError("database_jobs_invalid_json");
    }
    if (!Array.isArray(payload) || payload.length > DATABASE_ALERT_PAGE_SIZE)
      throw new OperationalError("database_jobs_shape");
    for (const row of payload) {
      const decoded = decodeDatabaseJobRow(row);
      if (decoded.ok) jobs.push(decoded.job);
      else rejected += 1;
    }
    if (payload.length < DATABASE_ALERT_PAGE_SIZE) break;
    offset += payload.length;
  }
  if (rejected)
    console.warn(
      JSON.stringify({
        event: "worker.rows_quarantined",
        operation: "jobs.alert_catalog",
        code: "database_jobs_invalid_rows",
        rejected,
      }),
    );
  return {
    state: rejected ? "degraded" : "ready",
    jobs,
    issues: rejected
      ? [{ code: "database_jobs_invalid_rows", count: rejected }]
      : [],
  };
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
  const publishableKey = getRuntimeHeaderCredential(
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
    await discardResponseBody(response);
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
  if (
    jobs.some((job) => job.source.id === JOBICY_SOURCE_POLICY.id) &&
    !(await rpc(
      "worker_alert_source_enabled",
      rpcBooleanResultSchema,
      { p_adapter_key: "jobicy" },
      { signal },
    ))
  )
    throw new OperationalError("jobicy_source_revoked");
  if (!containsRemotive) return;
  if (!(await fetchRemotivePublicationEnabled(signal))) {
    throw new OperationalError("remotive_source_revoked");
  }
}

export async function fetchAlertJobCatalog(
  signal: AbortSignal,
  includeSecondary = true,
): Promise<AlertJobCatalogResult> {
  const [database, remotiveEnabled] = await Promise.all([
    fetchDatabaseJobs(signal),
    fetchRemotivePublicationEnabled(signal),
  ]);
  // The optional feed is read only when its current registry permits email.
  const jobicyEnabled =
    includeSecondary &&
    (await rpc(
      "worker_alert_source_enabled",
      rpcBooleanResultSchema,
      { p_adapter_key: "jobicy" },
      { signal },
    ));
  if (jobicyEnabled) {
    const snapshot = await raceWithSignal(
      readSecondaryFeedSnapshot("jobicy"),
      signal,
    );
    try {
      if (snapshot.state === "ready") {
        const feedJobs = parseAlertCatalog(snapshot.catalog)
          .filter(
            (job) =>
              job.source.id === JOBICY_SOURCE_POLICY.id &&
              Date.now() - Date.parse(job.lastCheckedAt) <= 24 * 60 * 60 * 1000,
          )
          .map((job) => ({
            ...job,
            source: { ...job.source, canEmail: true },
          }));
        database.jobs = mergeAlertJobCatalogs(database.jobs, feedJobs);
      } else {
        database.state = "degraded";
        database.issues.push({
          code: `jobicy_alert_catalog_${snapshot.state}`,
        });
      }
    } catch (reason) {
      if (
        !(reason instanceof OperationalError) ||
        !RECOVERABLE_ALERT_CATALOG_ERRORS.has(reason.code)
      )
        throw reason;
      database.state = "degraded";
      database.issues.push({ code: `jobicy_${reason.code}` });
    }
  }
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
      return {
        state: "degraded",
        jobs: database.jobs,
        issues: [...database.issues, { code: reason.code }],
      };
    }
    throw reason;
  }
  return {
    state: database.state,
    jobs: mergeAlertJobCatalogs(database.jobs, remotive),
    issues: database.issues,
  };
}

export function mergeAlertJobCatalogs(
  database: readonly Job[],
  remotive: readonly Job[],
): Job[] {
  const byFingerprint = new Map<string, Job>();
  for (const job of [...database, ...remotive]) {
    const fingerprint = buildJobFingerprint({
      title: job.title,
      company: job.company.name,
      location: job.locationDisplay,
      arrangement: job.arrangement,
      destination: job.applicationUrl,
    });
    if (!byFingerprint.has(fingerprint)) {
      byFingerprint.set(
        fingerprint,
        job.fingerprint === fingerprint ? job : { ...job, fingerprint },
      );
    }
  }
  return [...byFingerprint.values()];
}

export * from "./job-alert-delivery";
