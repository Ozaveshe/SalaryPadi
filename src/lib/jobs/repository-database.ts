import "server-only";

import {
  mapRepositoryResult,
  repositoryDegraded,
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
  type RepositoryIssue,
  type RepositoryResult,
} from "@/lib/data/repository-result";
import { getSupabasePublicConfig } from "@/lib/env";
import { discardResponseBody } from "@/lib/http/body";
import { readBoundedJson } from "@/lib/http/json";

import { decodeDatabaseJobRow } from "./database";
import { sourceUnavailable, type SourceFeed } from "./repository-contracts";
import type { Job } from "./types";

const DATABASE_JOBS_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DATABASE_JOB_LOOKUP_MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_DATABASE_FEED_JOBS = 500;
const PUBLIC_JOB_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,199}$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

function uniqueJobsById(jobs: Job[]) {
  const seenIds = new Set<string>();
  let duplicates = 0;
  return {
    jobs: jobs.filter((job) => {
      if (seenIds.has(job.id)) {
        duplicates += 1;
        return false;
      }
      seenIds.add(job.id);
      return true;
    }),
    duplicates,
  };
}

export async function getDatabaseJobFeed(): Promise<SourceFeed> {
  const checkedAt = new Date().toISOString();
  const configuration = getSupabasePublicConfig();
  if (!configuration) {
    return sourceUnavailable(
      "database",
      checkedAt,
      "database_unconfigured",
      "Reviewed employer jobs are temporarily unavailable.",
    );
  }

  const endpoint = new URL("/rest/v1/jobs", configuration.url);
  endpoint.searchParams.set("select", "*");
  endpoint.searchParams.set("order", "posted_at.desc");
  endpoint.searchParams.set("limit", String(MAX_DATABASE_FEED_JOBS + 1));
  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        "Accept-Profile": "api",
        apikey: configuration.publishableKey,
        Authorization: `Bearer ${configuration.publishableKey}`,
      },
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(6_000),
    });
  } catch {
    return sourceUnavailable(
      "database",
      checkedAt,
      "database_jobs_query_failed",
      "Reviewed employer jobs are temporarily unavailable.",
    );
  }
  if (!response.ok) {
    await discardResponseBody(response);
    return sourceUnavailable(
      "database",
      checkedAt,
      `database_jobs_${response.status}`,
      "Reviewed employer jobs are temporarily unavailable.",
    );
  }
  let data: unknown;
  try {
    data = await readBoundedJson(response, DATABASE_JOBS_MAX_RESPONSE_BYTES);
  } catch {
    return sourceUnavailable(
      "database",
      checkedAt,
      "database_jobs_invalid_json",
      "Reviewed employer jobs are temporarily unavailable.",
    );
  }
  if (!Array.isArray(data)) {
    return sourceUnavailable(
      "database",
      checkedAt,
      "database_jobs_shape",
      "Reviewed employer jobs are temporarily unavailable.",
    );
  }

  const capacityExceeded = data.length > MAX_DATABASE_FEED_JOBS;
  const decoded = data
    .slice(0, MAX_DATABASE_FEED_JOBS)
    .map((row) => decodeDatabaseJobRow(row));
  const decodedJobs = decoded.flatMap((result) =>
    result.ok ? [result.job] : [],
  );
  const { jobs, duplicates } = uniqueJobsById(decodedJobs);
  const rejectedRows = decoded.filter((result) => !result.ok);
  const rejected = rejectedRows.length;
  if (rejected > 0) {
    console.warn(
      JSON.stringify({
        event: "repository.rows_quarantined",
        operation: "jobs.public_feed",
        code: "database_jobs_invalid_rows",
        rejected,
        issue_paths: [
          ...new Set(rejectedRows.flatMap((result) => result.issuePaths)),
        ].slice(0, 12),
      }),
    );
  }
  if (capacityExceeded) {
    console.warn(
      JSON.stringify({
        event: "repository.capacity_exceeded",
        operation: "jobs.public_feed",
        code: "database_jobs_capacity_exceeded",
        maximum: MAX_DATABASE_FEED_JOBS,
      }),
    );
  }
  if (duplicates > 0) {
    console.warn(
      JSON.stringify({
        event: "repository.rows_quarantined",
        operation: "jobs.public_feed",
        code: "database_jobs_duplicate_rows",
        rejected: duplicates,
      }),
    );
  }
  const degraded = rejected > 0 || duplicates > 0 || capacityExceeded;
  const message = [
    ...(capacityExceeded
      ? [
          `More than ${MAX_DATABASE_FEED_JOBS} reviewed jobs are available; this feed is showing only the newest ${MAX_DATABASE_FEED_JOBS}.`,
        ]
      : []),
    ...(rejected > 0
      ? [
          `${rejected} reviewed job ${rejected === 1 ? "record was" : "records were"} quarantined because the public contract was invalid.`,
        ]
      : []),
    ...(duplicates > 0
      ? [
          `${duplicates} duplicate reviewed job ${duplicates === 1 ? "record was" : "records were"} quarantined.`,
        ]
      : []),
  ].join(" ");
  return {
    key: "database",
    jobs,
    state: degraded ? "degraded" : "live",
    checkedAt,
    count: jobs.length,
    ...(degraded
      ? {
          code: capacityExceeded
            ? "database_jobs_capacity_exceeded"
            : rejected > 0
              ? "database_jobs_invalid_rows"
              : "database_jobs_duplicate_rows",
          message,
        }
      : {}),
  };
}

type DatabaseJobLookup = {
  column: "slug" | "dedup_fingerprint";
  value: string;
  operator?: "eq" | "in";
  includeId: boolean;
  limit: number;
};

async function readDatabaseJobLookupResult({
  column,
  value,
  operator = "eq",
  includeId,
  limit,
}: DatabaseJobLookup): Promise<RepositoryResult<Job[]>> {
  const operation = "jobs.public_detail";
  const configuration = getSupabasePublicConfig();
  if (!configuration) {
    return repositoryFailure(
      "unconfigured",
      [],
      repositoryIssue(operation, "not_configured", "database_unconfigured"),
    );
  }

  const endpoint = new URL("/rest/v1/jobs", configuration.url);
  endpoint.searchParams.set("select", "*");
  if (includeId && UUID_PATTERN.test(value)) {
    endpoint.searchParams.set("or", `(slug.eq.${value},id.eq.${value})`);
  } else {
    endpoint.searchParams.set(column, `${operator}.${value}`);
  }
  endpoint.searchParams.set("limit", `${limit}`);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        "Accept-Profile": "api",
        apikey: configuration.publishableKey,
        Authorization: `Bearer ${configuration.publishableKey}`,
      },
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(6_000),
    });
  } catch (reason) {
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        operation,
        "query_failed",
        "database_jobs_query_failed",
        reason,
      ),
    );
  }
  if (!response.ok) {
    await discardResponseBody(response);
    return repositoryFailure(
      "unavailable",
      [],
      repositoryIssue(
        operation,
        "query_failed",
        `database_jobs_${response.status}`,
      ),
    );
  }

  let data: unknown;
  try {
    data = await readBoundedJson(
      response,
      DATABASE_JOB_LOOKUP_MAX_RESPONSE_BYTES,
    );
  } catch (reason) {
    return repositoryFailure(
      "invalid",
      [],
      repositoryIssue(
        operation,
        "invalid_container",
        "database_jobs_invalid_json",
        reason,
      ),
    );
  }
  if (!Array.isArray(data) || data.length > limit) {
    return repositoryFailure(
      "invalid",
      [],
      repositoryIssue(operation, "invalid_container", "database_jobs_shape"),
    );
  }

  const decoded = data.map((row) => decodeDatabaseJobRow(row));
  const decodedJobs = decoded.flatMap((result) =>
    result.ok ? [result.job] : [],
  );
  const { jobs, duplicates } = uniqueJobsById(decodedJobs);
  const rejectedRows = decoded.filter((result) => !result.ok);
  const issues: RepositoryIssue[] = [];
  if (rejectedRows.length > 0) {
    issues.push(
      repositoryIssue(operation, "invalid_rows", "database_jobs_invalid_rows"),
    );
  }
  if (duplicates > 0) {
    issues.push(
      repositoryIssue(
        operation,
        "invalid_rows",
        "database_jobs_duplicate_rows",
      ),
    );
  }
  return issues.length > 0
    ? repositoryDegraded(jobs, issues)
    : repositoryReady(jobs);
}

export async function getDatabaseJobBySlugResult(
  slugOrId: string,
): Promise<RepositoryResult<Job | null>> {
  if (!PUBLIC_JOB_IDENTIFIER_PATTERN.test(slugOrId)) {
    return repositoryReady(null);
  }
  return mapRepositoryResult(
    await readDatabaseJobLookupResult({
      column: "slug",
      value: slugOrId,
      includeId: true,
      limit: 2,
    }),
    (jobs) =>
      jobs.find((job) => job.id === slugOrId) ??
      jobs.find((job) => job.slug === slugOrId) ??
      null,
  );
}

export async function getDatabaseJobsByFingerprintResult(
  fingerprints: string[],
) {
  const validFingerprints = fingerprints.filter((fingerprint) =>
    FINGERPRINT_PATTERN.test(fingerprint),
  );
  if (validFingerprints.length === 0) return repositoryReady([]);
  return readDatabaseJobLookupResult({
    column: "dedup_fingerprint",
    value: `(${validFingerprints.join(",")})`,
    operator: "in",
    includeId: false,
    limit: 10,
  });
}

export function databaseDetailSource(
  result: RepositoryResult<Job | null> | RepositoryResult<Job[]>,
): SourceFeed {
  const jobs = Array.isArray(result.data)
    ? result.data
    : result.data
      ? [result.data]
      : [];
  const checkedAt =
    jobs
      .map((job) => job.lastCheckedAt)
      .filter((value) => Number.isFinite(Date.parse(value)))
      .toSorted((a, b) => Date.parse(b) - Date.parse(a))[0] ??
    new Date().toISOString();
  if (result.state === "ready") {
    return {
      key: "database",
      jobs,
      state: "live",
      checkedAt,
      count: jobs.length,
    };
  }
  const degraded = result.state === "degraded";
  return {
    key: "database",
    jobs,
    state: degraded ? "degraded" : "unavailable",
    checkedAt,
    count: jobs.length,
    code: result.issues[0]?.code ?? "database_jobs_query_failed",
    message: degraded
      ? "Some reviewed employer job evidence was invalid and was excluded."
      : "Reviewed employer jobs are temporarily unavailable.",
  };
}
