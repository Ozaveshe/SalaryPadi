import "server-only";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { getServerEnvironment } from "@/lib/env";
import { externalHttpsUrlSchema } from "@/lib/security/url-schema";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { buildJobFingerprintLookupKeys } from "./fingerprint";
import { fetchJobicyJobs, JobicyAdapterError } from "./jobicy-adapter";
import {
  fetchRemotiveJobs,
  RemotiveAdapterError,
  type RemotiveFetch,
} from "./remotive-adapter";
import { sourceUnavailable, type SourceFeed } from "./repository-contracts";
import {
  databaseDetailSource,
  getDatabaseJobBySlugResult,
  getDatabaseJobFeed,
  getDatabaseJobsByFingerprintResult,
} from "./repository-database";
import { combineJobSources } from "./repository-reconciliation";
import {
  JOBICY_ADAPTER_KEY,
  JOBICY_CACHE_TAG,
  JOBICY_REQUIRED_DESTINATION_KIND,
  JOBICY_SOURCE_POLICY,
  JOBICY_TERMS_VERSION,
  REMOTIVE_ADAPTER_KEY,
  REMOTIVE_CACHE_TAG,
  REMOTIVE_REQUIRED_DESTINATION_KIND,
  REMOTIVE_SOURCE_POLICY,
  REMOTIVE_TERMS_VERSION,
} from "./source-policy";
import { openSupplyAdapter } from "./supply/adapters";
import { AdapterPolicyError } from "./supply/policy";
import type { Job, JobFeedResult } from "./types";

export { getDatabaseJobBySlugResult } from "./repository-database";

type ServerSupabaseClient = NonNullable<
  Awaited<ReturnType<typeof createServerSupabaseClient>>
>;

const SOURCE_MAX_AGE_MS = 14 * 60 * 60 * 1_000;
const SOURCE_MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const reviewedPolicyRowSchema = z
  .object({
    adapter_key: z.string().min(1).max(80),
    source_type: z.string().min(1).max(40),
    terms_url: externalHttpsUrlSchema,
    terms_reviewed_at: z.iso.datetime({ offset: true }),
    terms_version: z.string().min(1).max(160),
    attribution_required: z.boolean(),
    may_store_full_description: z.boolean(),
    may_index_jobs: z.boolean(),
    may_emit_jobposting_schema: z.boolean(),
    allow_public_listing: z.boolean(),
    required_destination_kind: z.string().min(1).max(40),
    refresh_interval_seconds: z.number().int().positive().max(604_800),
  })
  .strict();

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
    return fetch(endpoint, {
      ...init,
      headers,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
  };
}

async function resolveClient(
  supplied: ServerSupabaseClient | null | undefined,
): Promise<ServerSupabaseClient | null> {
  return supplied === undefined ? await createServerSupabaseClient() : supplied;
}

function sourceRegistryUnavailable(
  key: SourceFeed["key"],
  attemptedAt: string,
  code: string,
) {
  return sourceUnavailable(
    key,
    attemptedAt,
    code,
    "The reviewed job source policy could not be verified.",
  );
}

function readRemotivePolicy(supabase: ServerSupabaseClient) {
  return supabase
    .schema("api")
    .from("job_sources")
    .select(
      "adapter_key,source_type,terms_url,terms_reviewed_at,terms_version,attribution_required,may_store_full_description,may_index_jobs,may_emit_jobposting_schema,allow_public_listing,required_destination_kind,refresh_interval_seconds",
    )
    .eq("adapter_key", REMOTIVE_ADAPTER_KEY)
    .abortSignal(AbortSignal.timeout(4_000))
    .maybeSingle();
}

function readJobicyPolicy(supabase: ServerSupabaseClient) {
  return supabase
    .schema("api")
    .from("job_sources")
    .select(
      "adapter_key,source_type,terms_url,terms_reviewed_at,terms_version,attribution_required,may_store_full_description,may_index_jobs,may_emit_jobposting_schema,allow_public_listing,required_destination_kind,refresh_interval_seconds",
    )
    .eq("adapter_key", JOBICY_ADAPTER_KEY)
    .abortSignal(AbortSignal.timeout(4_000))
    .maybeSingle();
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
  try {
    openSupplyAdapter("remotive", new Date(attemptedAt));
  } catch (reason) {
    const code =
      reason instanceof AdapterPolicyError
        ? `remotive_${reason.code}`
        : "remotive_policy_invalid";
    return {
      key: "remotive",
      jobs: [],
      state: "disabled",
      checkedAt: attemptedAt,
      count: 0,
      code,
      message:
        "The reviewed Remotive source is disabled by the application source-policy registry.",
    };
  }
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

  let supabase: ServerSupabaseClient | null;
  try {
    supabase = await resolveClient(suppliedClient);
  } catch (reason) {
    unstable_rethrow(reason);
    return sourceRegistryUnavailable(
      "remotive",
      attemptedAt,
      "source_registry_client_failed",
    );
  }
  if (!supabase) {
    return sourceUnavailable(
      "remotive",
      attemptedAt,
      "source_registry_unconfigured",
      "The job source registry is not configured.",
    );
  }

  let policy: Awaited<ReturnType<typeof readRemotivePolicy>>;
  try {
    policy = await readRemotivePolicy(supabase);
  } catch (reason) {
    unstable_rethrow(reason);
    return sourceRegistryUnavailable(
      "remotive",
      attemptedAt,
      "source_registry_query_failed",
    );
  }

  if (policy.error) {
    return sourceRegistryUnavailable(
      "remotive",
      attemptedAt,
      "source_registry_query_failed",
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
  const parsedPolicy = reviewedPolicyRowSchema.safeParse(policy.data);
  if (!parsedPolicy.success) {
    return sourceUnavailable(
      "remotive",
      attemptedAt,
      "remotive_policy_invalid",
      "The live source policy is malformed and cannot authorize acquisition.",
    );
  }
  const policyRow = parsedPolicy.data;
  if (
    policyRow.adapter_key !== REMOTIVE_ADAPTER_KEY ||
    policyRow.source_type !== REMOTIVE_SOURCE_POLICY.type ||
    policyRow.terms_url !== REMOTIVE_SOURCE_POLICY.termsUrl ||
    policyRow.terms_version !== REMOTIVE_TERMS_VERSION ||
    !policyRow.attribution_required ||
    policyRow.may_store_full_description !==
      REMOTIVE_SOURCE_POLICY.canStoreFullDescription ||
    policyRow.may_index_jobs !== REMOTIVE_SOURCE_POLICY.canIndex ||
    policyRow.may_emit_jobposting_schema !==
      REMOTIVE_SOURCE_POLICY.canUseJobPostingStructuredData ||
    !policyRow.allow_public_listing ||
    policyRow.required_destination_kind !==
      REMOTIVE_REQUIRED_DESTINATION_KIND ||
    policyRow.refresh_interval_seconds !==
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

/**
 * Jobicy is authorized by both the reviewed application registry and the live
 * operator registry. Either gate can stop acquisition independently.
 */
export async function getJobicyJobFeed(
  suppliedClient?: ServerSupabaseClient | null,
): Promise<SourceFeed> {
  const attemptedAt = new Date().toISOString();
  try {
    openSupplyAdapter("jobicy", new Date(attemptedAt));
  } catch (reason) {
    const code =
      reason instanceof AdapterPolicyError
        ? `jobicy_${reason.code}`
        : "jobicy_policy_invalid";
    return {
      key: "jobicy",
      jobs: [],
      state: "disabled",
      checkedAt: attemptedAt,
      count: 0,
      code,
      message:
        "The reviewed Jobicy source is disabled by the application source-policy registry.",
    };
  }

  let supabase: ServerSupabaseClient | null;
  try {
    supabase = await resolveClient(suppliedClient);
  } catch (reason) {
    unstable_rethrow(reason);
    return sourceRegistryUnavailable(
      "jobicy",
      attemptedAt,
      "source_registry_client_failed",
    );
  }
  if (!supabase) {
    return sourceUnavailable(
      "jobicy",
      attemptedAt,
      "source_registry_unconfigured",
      "The job source registry is not configured.",
    );
  }

  let policy: Awaited<ReturnType<typeof readJobicyPolicy>>;
  try {
    policy = await readJobicyPolicy(supabase);
  } catch (reason) {
    unstable_rethrow(reason);
    return sourceRegistryUnavailable(
      "jobicy",
      attemptedAt,
      "source_registry_query_failed",
    );
  }
  if (policy.error) {
    return sourceRegistryUnavailable(
      "jobicy",
      attemptedAt,
      "source_registry_query_failed",
    );
  }
  if (!policy.data) {
    return {
      key: "jobicy",
      jobs: [],
      state: "disabled",
      checkedAt: attemptedAt,
      count: 0,
      code: "jobicy_policy_disabled",
      message: "The reviewed Jobicy source is paused or disabled.",
    };
  }

  const parsedPolicy = reviewedPolicyRowSchema.safeParse(policy.data);
  if (!parsedPolicy.success) {
    return sourceUnavailable(
      "jobicy",
      attemptedAt,
      "jobicy_policy_invalid",
      "The live source policy is malformed and cannot authorize acquisition.",
    );
  }
  const policyRow = parsedPolicy.data;
  if (
    policyRow.adapter_key !== JOBICY_ADAPTER_KEY ||
    policyRow.source_type !== JOBICY_SOURCE_POLICY.type ||
    policyRow.terms_url !== JOBICY_SOURCE_POLICY.termsUrl ||
    policyRow.terms_version !== JOBICY_TERMS_VERSION ||
    !policyRow.attribution_required ||
    policyRow.may_store_full_description !==
      JOBICY_SOURCE_POLICY.canStoreFullDescription ||
    policyRow.may_index_jobs !== JOBICY_SOURCE_POLICY.canIndex ||
    policyRow.may_emit_jobposting_schema !==
      JOBICY_SOURCE_POLICY.canUseJobPostingStructuredData ||
    !policyRow.allow_public_listing ||
    policyRow.required_destination_kind !== JOBICY_REQUIRED_DESTINATION_KIND ||
    policyRow.refresh_interval_seconds !==
      JOBICY_SOURCE_POLICY.refreshIntervalSeconds
  ) {
    return sourceUnavailable(
      "jobicy",
      attemptedAt,
      "jobicy_policy_mismatch",
      "The live source policy does not match the reviewed application policy.",
    );
  }

  try {
    const result = await fetchJobicyJobs({
      requestedAt: new Date(attemptedAt),
      signal: AbortSignal.timeout(10_000),
      requestInit: {
        next: {
          revalidate: JOBICY_SOURCE_POLICY.refreshIntervalSeconds,
          tags: [JOBICY_CACHE_TAG],
        },
      },
    });
    const checkedAt = Date.parse(result.checkedAt);
    const ageMs = Date.now() - checkedAt;
    if (!Number.isFinite(checkedAt) || ageMs > SOURCE_MAX_AGE_MS) {
      return sourceUnavailable(
        "jobicy",
        attemptedAt,
        "jobicy_snapshot_stale",
        "The reviewed Jobicy snapshot is too old to publish.",
      );
    }
    if (ageMs < -SOURCE_MAX_FUTURE_SKEW_MS) {
      return sourceUnavailable(
        "jobicy",
        attemptedAt,
        "jobicy_snapshot_future",
        "The reviewed Jobicy source returned invalid freshness evidence.",
      );
    }
    return {
      key: "jobicy",
      jobs: result.jobs,
      state: "live",
      checkedAt: result.checkedAt,
      count: result.jobs.length,
    };
  } catch (reason) {
    const code =
      reason instanceof JobicyAdapterError
        ? reason.code
        : "jobicy_adapter_failed";
    return sourceUnavailable(
      "jobicy",
      attemptedAt,
      code,
      "The reviewed Jobicy source could not be safely refreshed. Try again later.",
    );
  }
}

export async function getLiveJobFeed(): Promise<JobFeedResult> {
  const [jobicy, remotive, database] = await Promise.all([
    getJobicyJobFeed(),
    getRemotiveJobFeed(),
    getDatabaseJobFeed(),
  ]);
  return combineJobSources([jobicy, remotive, database]);
}

export async function getJobBySlug(
  slugOrId: string,
): Promise<{ feed: JobFeedResult; job: Job | null }> {
  const databaseResult = await getDatabaseJobBySlugResult(slugOrId);
  if (databaseResult.data) {
    const feed = combineJobSources([databaseDetailSource(databaseResult)]);
    return { feed, job: feed.jobs[0] ?? null };
  }

  const [jobicy, remotive] = await Promise.all([
    getJobicyJobFeed(),
    getRemotiveJobFeed(),
  ]);
  const candidate = [...jobicy.jobs, ...remotive.jobs].find(
    (job) => job.slug === slugOrId || job.id === slugOrId,
  );
  let databaseSource = databaseDetailSource(databaseResult);
  if (candidate && databaseResult.state === "ready") {
    const fingerprintKeys = buildJobFingerprintLookupKeys({
      title: candidate.title,
      company: candidate.company.name,
      location: candidate.locationDisplay,
      arrangement: candidate.arrangement,
      destination: candidate.applicationUrl,
    });
    databaseSource = databaseDetailSource(
      await getDatabaseJobsByFingerprintResult(fingerprintKeys),
    );
  }
  const feed = combineJobSources([jobicy, remotive, databaseSource]);
  return {
    feed,
    job:
      feed.jobs.find((job) => job.slug === slugOrId || job.id === slugOrId) ??
      null,
  };
}
