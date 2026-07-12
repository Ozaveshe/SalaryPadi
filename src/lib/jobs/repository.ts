import "server-only";

import { getServerEnvironment, getSupabasePublicConfig } from "@/lib/env";
import { readBoundedJson } from "@/lib/http/json";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { decodeDatabaseJobRow } from "./database";
import {
  fetchRemotiveJobs,
  RemotiveAdapterError,
  type RemotiveFetch,
} from "./remotive-adapter";
import {
  REMOTIVE_ADAPTER_KEY,
  REMOTIVE_CACHE_TAG,
  REMOTIVE_REQUIRED_DESTINATION_KIND,
  REMOTIVE_SOURCE_POLICY,
  REMOTIVE_TERMS_VERSION,
} from "./source-policy";
import type { Job, JobFeedResult, JobFeedSourceStatus } from "./types";

type ServerSupabaseClient = NonNullable<
  Awaited<ReturnType<typeof createServerSupabaseClient>>
>;

type SourceFeed = JobFeedSourceStatus & { jobs: Job[] };
const SOURCE_MAX_AGE_MS = 14 * 60 * 60 * 1_000;
const SOURCE_MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const DATABASE_JOBS_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function createRemotiveProxyFetch(): RemotiveFetch {
  const environment = getServerEnvironment();
  const token = environment.JOB_SOURCE_SYNC_TOKEN;
  if (!token) throw new Error("The source proxy is not configured.");
  const origin = new URL(environment.NEXT_PUBLIC_APP_URL);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  const allowedLocal =
    environment.NODE_ENV !== "production" && localHosts.has(origin.hostname);
  if (origin.origin !== "https://salarypadi.com" && !allowedLocal) {
    throw new Error("The source proxy origin is invalid.");
  }
  const endpoint = new URL("/api/internal/remotive-source", origin.origin);

  return async (_input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(endpoint, { ...init, headers });
  };
}

function sourceUnavailable(
  key: SourceFeed["key"],
  checkedAt: string,
  code: string,
  message: string,
): SourceFeed {
  return {
    key,
    jobs: [],
    state: "unavailable",
    checkedAt,
    count: 0,
    code,
    message,
  };
}

async function resolveClient(
  supplied: ServerSupabaseClient | null | undefined,
): Promise<ServerSupabaseClient | null> {
  return supplied === undefined ? await createServerSupabaseClient() : supplied;
}

/**
 * Public acquisition is fail-closed against the active source registry. The
 * environment flag is the emergency kill switch; the database row is the
 * reviewed operator policy. Neither one can enable the other.
 */
export async function getRemotiveJobFeed(
  suppliedClient?: ServerSupabaseClient | null,
): Promise<SourceFeed> {
  const attemptedAt = new Date().toISOString();
  if (!getServerEnvironment().REMOTIVE_SOURCE_ENABLED) {
    return {
      key: "remotive",
      jobs: [],
      state: "disabled",
      checkedAt: attemptedAt,
      count: 0,
      code: "remotive_environment_disabled",
      message: "The reviewed Remotive source is disabled in this environment.",
    };
  }

  const supabase = await resolveClient(suppliedClient);
  if (!supabase) {
    return sourceUnavailable(
      "remotive",
      attemptedAt,
      "source_registry_unconfigured",
      "The job source registry is not configured.",
    );
  }

  const policy = await supabase
    .schema("api")
    .from("job_sources")
    .select(
      "adapter_key,source_type,terms_url,terms_reviewed_at,terms_version,attribution_required,may_store_full_description,may_index_jobs,may_emit_jobposting_schema,allow_public_listing,required_destination_kind,refresh_interval_seconds",
    )
    .eq("adapter_key", REMOTIVE_ADAPTER_KEY)
    .abortSignal(AbortSignal.timeout(4_000))
    .maybeSingle();

  if (policy.error) {
    return sourceUnavailable(
      "remotive",
      attemptedAt,
      "source_registry_query_failed",
      "The reviewed job source policy could not be verified.",
    );
  }
  if (!policy.data) {
    return {
      key: "remotive",
      jobs: [],
      state: "disabled",
      checkedAt: attemptedAt,
      count: 0,
      code: "remotive_policy_disabled",
      message: "The reviewed Remotive source is paused or disabled.",
    };
  }
  if (
    !policy.data.terms_reviewed_at ||
    policy.data.source_type !== REMOTIVE_SOURCE_POLICY.type ||
    policy.data.terms_url !== REMOTIVE_SOURCE_POLICY.termsUrl ||
    policy.data.terms_version !== REMOTIVE_TERMS_VERSION ||
    !policy.data.attribution_required ||
    policy.data.may_store_full_description !==
      REMOTIVE_SOURCE_POLICY.canStoreFullDescription ||
    policy.data.may_index_jobs !== REMOTIVE_SOURCE_POLICY.canIndex ||
    policy.data.may_emit_jobposting_schema !==
      REMOTIVE_SOURCE_POLICY.canUseJobPostingStructuredData ||
    !policy.data.allow_public_listing ||
    policy.data.required_destination_kind !==
      REMOTIVE_REQUIRED_DESTINATION_KIND ||
    policy.data.refresh_interval_seconds !==
      REMOTIVE_SOURCE_POLICY.refreshIntervalSeconds
  ) {
    return sourceUnavailable(
      "remotive",
      attemptedAt,
      "remotive_policy_mismatch",
      "The live source policy does not match the reviewed application policy.",
    );
  }

  try {
    const result = await fetchRemotiveJobs({
      fetch: createRemotiveProxyFetch(),
      requestedAt: new Date(attemptedAt),
      signal: AbortSignal.timeout(10_000),
      requestInit: {
        headers: { Accept: "application/json" },
        next: {
          revalidate: REMOTIVE_SOURCE_POLICY.refreshIntervalSeconds,
          tags: [REMOTIVE_CACHE_TAG],
        },
      },
    });
    const checkedAt = Date.parse(result.checkedAt);
    const ageMs = Date.now() - checkedAt;
    if (!Number.isFinite(checkedAt) || ageMs > SOURCE_MAX_AGE_MS) {
      return sourceUnavailable(
        "remotive",
        attemptedAt,
        "remotive_snapshot_stale",
        "The reviewed live source snapshot is too old to publish.",
      );
    }
    if (ageMs < -SOURCE_MAX_FUTURE_SKEW_MS) {
      return sourceUnavailable(
        "remotive",
        attemptedAt,
        "remotive_snapshot_future",
        "The reviewed live source returned an invalid freshness time.",
      );
    }
    return {
      key: "remotive",
      jobs: result.jobs,
      state: "live",
      checkedAt: result.checkedAt,
      count: result.jobs.length,
    };
  } catch (reason) {
    const code =
      reason instanceof RemotiveAdapterError
        ? reason.code
        : "remotive_adapter_failed";
    return sourceUnavailable(
      "remotive",
      attemptedAt,
      code,
      "The reviewed live source could not be safely refreshed. Try again later.",
    );
  }
}

async function getDatabaseJobFeed(): Promise<SourceFeed> {
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
  endpoint.searchParams.set("limit", "500");
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

  const decoded = data.map((row) => decodeDatabaseJobRow(row));
  const jobs = decoded.flatMap((result) => (result.ok ? [result.job] : []));
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
  return {
    key: "database",
    jobs,
    state: rejected > 0 ? "degraded" : "live",
    checkedAt,
    count: jobs.length,
    ...(rejected > 0
      ? {
          code: "database_jobs_invalid_rows",
          message: `${rejected} reviewed job ${rejected === 1 ? "record was" : "records were"} quarantined because the public contract was invalid.`,
        }
      : {}),
  };
}

function sourcePriority(job: Job) {
  if (job.source.type === "employer") return 4;
  if (job.source.type === "partner") return 3;
  if (job.source.type === "manual") return 2;
  return 1;
}

function overallCheckedAt(sources: SourceFeed[]): string {
  const values = sources
    .map(({ checkedAt }) => Date.parse(checkedAt))
    .filter(Number.isFinite);
  return new Date(
    values.length > 0 ? Math.min(...values) : Date.now(),
  ).toISOString();
}

export async function getLiveJobFeed(): Promise<JobFeedResult> {
  const supabase = await createServerSupabaseClient();
  const [remotive, database] = await Promise.all([
    getRemotiveJobFeed(supabase),
    getDatabaseJobFeed(),
  ]);
  const sources = [remotive, database];
  const jobsByFingerprint = new Map<string, Job>();
  for (const job of [...remotive.jobs, ...database.jobs]) {
    const current = jobsByFingerprint.get(job.fingerprint);
    if (!current || sourcePriority(job) > sourcePriority(current)) {
      jobsByFingerprint.set(job.fingerprint, job);
    }
  }
  const jobs = [...jobsByFingerprint.values()];
  const sourceProblems = sources.filter(
    ({ state }) => state === "unavailable" || state === "degraded",
  );
  const state: JobFeedResult["state"] =
    jobs.length > 0
      ? sourceProblems.length > 0
        ? "degraded"
        : "live"
      : sourceProblems.length > 0
        ? "unavailable"
        : remotive.state === "disabled"
          ? "disabled"
          : "live";
  const messageSources =
    state === "disabled"
      ? sources.filter(({ state: sourceState }) => sourceState !== "live")
      : sourceProblems;
  const messages = messageSources
    .map(({ message }) => message)
    .filter((message): message is string => Boolean(message));

  return {
    jobs,
    state,
    checkedAt: overallCheckedAt(sources),
    ...(messages.length > 0 ? { message: messages.join(" ") } : {}),
    sources: sources.map(
      ({ key, state: sourceState, checkedAt, count, code, message }) => ({
        key,
        state: sourceState,
        checkedAt,
        count,
        ...(code ? { code } : {}),
        ...(message ? { message } : {}),
      }),
    ),
  };
}

export async function getJobBySlug(slugOrId: string) {
  const feed = await getLiveJobFeed();
  return {
    feed,
    job:
      feed.jobs.find((job) => job.slug === slugOrId || job.id === slugOrId) ??
      null,
  };
}
