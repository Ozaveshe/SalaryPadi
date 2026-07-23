import "server-only";

import { unstable_rethrow } from "next/navigation";

import { getServerEnvironment } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { buildJobFingerprintLookupKeys } from "./fingerprint";
import {
  fetchHimalayasJobs,
  HIMALAYAS_ENDPOINTS,
  HimalayasAdapterError,
} from "./himalayas-adapter";
import { fetchJobicyJobs, JobicyAdapterError } from "./jobicy-adapter";
import {
  fetchRemotiveJobs,
  RemotiveAdapterError,
  type RemotiveFetch,
} from "./remotive-adapter";
import { sourceUnavailable, type SourceFeed } from "./repository-contracts";
import {
  readSecondaryFeedSnapshot,
  type SecondaryFeedKey,
} from "./secondary-feed-store";
import {
  databaseDetailSource,
  getDatabaseJobBySlugResult,
  getDatabaseJobFeed,
  getDatabaseJobsByFingerprintResult,
} from "./repository-database";
import { combineJobSources } from "./repository-reconciliation";
import {
  REVIEWED_POLICY_SELECT_COLUMNS,
  reviewedPolicyMismatch,
  reviewedPolicyRowSchema,
  type ReviewedSourceExpectation,
} from "./reviewed-policy";
import {
  HIMALAYAS_ADAPTER_KEY,
  HIMALAYAS_CACHE_TAG,
  HIMALAYAS_REQUIRED_DESTINATION_KIND,
  HIMALAYAS_SOURCE_POLICY,
  HIMALAYAS_TERMS_VERSION,
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

/**
 * A snapshot stays publishable for its full reviewed refresh interval plus a
 * bounded grace window, so a source whose policy only allows daily polling
 * (for example Himalayas) is not rejected as stale between permitted fetches.
 */
const SOURCE_MAX_AGE_GRACE_MS = 2 * 60 * 60 * 1_000;
const SOURCE_MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

function sourceMaxAgeMs(refreshIntervalSeconds: number): number {
  return refreshIntervalSeconds * 1_000 + SOURCE_MAX_AGE_GRACE_MS;
}

/**
 * Serve a worker-written snapshot when one is fresh, so page rendering never
 * waits on the provider. Returns null when no publishable snapshot exists;
 * the caller then falls back to the bounded request-time fetch. This runs
 * only after the application registry and live operator policy have both
 * authorized the source, so a snapshot can never bypass the policy gates.
 */
async function readFreshSecondaryFeed(
  key: SecondaryFeedKey,
  refreshIntervalSeconds: number,
): Promise<SourceFeed | null> {
  const snapshot = await readSecondaryFeedSnapshot(key);
  if (snapshot.state !== "ready") return null;
  const checkedAt = Date.parse(snapshot.catalog.checkedAt);
  const ageMs = Date.now() - checkedAt;
  if (
    !Number.isFinite(checkedAt) ||
    ageMs > sourceMaxAgeMs(refreshIntervalSeconds) ||
    ageMs < -SOURCE_MAX_FUTURE_SKEW_MS
  ) {
    return null;
  }
  return {
    key,
    jobs: snapshot.catalog.jobs,
    state: "live",
    checkedAt: snapshot.catalog.checkedAt,
    count: snapshot.catalog.jobs.length,
  };
}

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

function readSourcePolicyRow(
  supabase: ServerSupabaseClient,
  adapterKey: string,
) {
  return supabase
    .schema("api")
    .from("job_sources")
    .select(REVIEWED_POLICY_SELECT_COLUMNS)
    .eq("adapter_key", adapterKey)
    .abortSignal(AbortSignal.timeout(4_000))
    .maybeSingle();
}

type SecondarySourceKey = "remotive" | "jobicy" | "himalayas";

interface SecondarySourceFetchResult {
  jobs: Job[];
  checkedAt: string;
  /** Present when the provider answered with a reviewed partial result. */
  degraded?: { code: string; message: string };
}

/**
 * Everything that legitimately differs between the reviewed secondary public
 * feeds. The shared engine below owns the gate order and freshness rules; a
 * descriptor may only choose its reviewed policy, its provider fetch, and the
 * operator-facing wording. Registering a new secondary source (for example
 * ReliefWeb) means writing one of these, not a fourth bespoke pipeline.
 */
interface SecondarySourceDescriptor {
  key: SecondarySourceKey;
  /** Reviewed application policy the live registry row must still match. */
  reviewed: ReviewedSourceExpectation;
  /**
   * Optional environment kill switch, checked after the application registry
   * gate and before any registry read. Neither gate can enable the other.
   */
  environment?: { isEnabled: () => boolean; message: string };
  /**
   * Worker snapshot served ahead of the request-time fetch, or null for a
   * source that is always fetched live at request time.
   */
  snapshotKey: SecondaryFeedKey | null;
  messages: {
    registryDisabled: string;
    policyPaused: string;
    snapshotStale: string;
    snapshotFuture: string;
    refreshFailed: string;
  };
  fetchJobs: (requestedAt: Date) => Promise<SecondarySourceFetchResult>;
  /** Maps a fetch failure to its published source-status code. */
  failureCode: (reason: unknown) => string;
}

/**
 * Public acquisition is fail-closed against three independent gates, in
 * order: the application source-policy registry, the per-source environment
 * kill switch, and the reviewed operator policy row in the database. No gate
 * can enable another, and every failure keeps the provider uncontacted.
 */
async function getSecondarySourceFeed(
  descriptor: SecondarySourceDescriptor,
  suppliedClient?: ServerSupabaseClient | null,
): Promise<SourceFeed> {
  const { key, reviewed, messages } = descriptor;
  const attemptedAt = new Date().toISOString();
  try {
    openSupplyAdapter(key, new Date(attemptedAt));
  } catch (reason) {
    const code =
      reason instanceof AdapterPolicyError
        ? `${key}_${reason.code}`
        : `${key}_policy_invalid`;
    return {
      key,
      jobs: [],
      state: "disabled",
      checkedAt: attemptedAt,
      count: 0,
      code,
      message: messages.registryDisabled,
    };
  }
  if (descriptor.environment && !descriptor.environment.isEnabled()) {
    return {
      key,
      jobs: [],
      state: "disabled",
      checkedAt: attemptedAt,
      count: 0,
      code: `${key}_environment_disabled`,
      message: descriptor.environment.message,
    };
  }

  let supabase: ServerSupabaseClient | null;
  try {
    supabase = await resolveClient(suppliedClient);
  } catch (reason) {
    unstable_rethrow(reason);
    return sourceRegistryUnavailable(
      key,
      attemptedAt,
      "source_registry_client_failed",
    );
  }
  if (!supabase) {
    return sourceUnavailable(
      key,
      attemptedAt,
      "source_registry_unconfigured",
      "The job source registry is not configured.",
    );
  }

  let policy: Awaited<ReturnType<typeof readSourcePolicyRow>>;
  try {
    policy = await readSourcePolicyRow(supabase, reviewed.adapterKey);
  } catch (reason) {
    unstable_rethrow(reason);
    return sourceRegistryUnavailable(
      key,
      attemptedAt,
      "source_registry_query_failed",
    );
  }
  if (policy.error) {
    return sourceRegistryUnavailable(
      key,
      attemptedAt,
      "source_registry_query_failed",
    );
  }
  if (!policy.data) {
    return {
      key,
      jobs: [],
      state: "disabled",
      checkedAt: attemptedAt,
      count: 0,
      code: `${key}_policy_disabled`,
      message: messages.policyPaused,
    };
  }

  const parsedPolicy = reviewedPolicyRowSchema.safeParse(policy.data);
  if (!parsedPolicy.success) {
    return sourceUnavailable(
      key,
      attemptedAt,
      `${key}_policy_invalid`,
      "The live source policy is malformed and cannot authorize acquisition.",
    );
  }
  if (reviewedPolicyMismatch(parsedPolicy.data, reviewed)) {
    return sourceUnavailable(
      key,
      attemptedAt,
      `${key}_policy_mismatch`,
      "The live source policy does not match the reviewed application policy.",
    );
  }

  if (descriptor.snapshotKey) {
    const snapshot = await readFreshSecondaryFeed(
      descriptor.snapshotKey,
      reviewed.policy.refreshIntervalSeconds,
    );
    if (snapshot) return snapshot;
  }

  try {
    const result = await descriptor.fetchJobs(new Date(attemptedAt));
    const checkedAt = Date.parse(result.checkedAt);
    const ageMs = Date.now() - checkedAt;
    if (
      !Number.isFinite(checkedAt) ||
      ageMs > sourceMaxAgeMs(reviewed.policy.refreshIntervalSeconds)
    ) {
      return sourceUnavailable(
        key,
        attemptedAt,
        `${key}_snapshot_stale`,
        messages.snapshotStale,
      );
    }
    if (ageMs < -SOURCE_MAX_FUTURE_SKEW_MS) {
      return sourceUnavailable(
        key,
        attemptedAt,
        `${key}_snapshot_future`,
        messages.snapshotFuture,
      );
    }
    return {
      key,
      jobs: result.jobs,
      state: result.degraded ? "degraded" : "live",
      checkedAt: result.checkedAt,
      count: result.jobs.length,
      ...(result.degraded
        ? { code: result.degraded.code, message: result.degraded.message }
        : {}),
    };
  } catch (reason) {
    return sourceUnavailable(
      key,
      attemptedAt,
      descriptor.failureCode(reason),
      messages.refreshFailed,
    );
  }
}

/**
 * Remotive's sharing terms are still under written clarification, so this
 * descriptor keeps the environment kill switch and routes every provider
 * request through the authenticated budgeted source proxy. It has no worker
 * snapshot: cache misses always take the bounded proxied fetch.
 */
const remotiveSourceDescriptor: SecondarySourceDescriptor = {
  key: "remotive",
  reviewed: {
    adapterKey: REMOTIVE_ADAPTER_KEY,
    policy: REMOTIVE_SOURCE_POLICY,
    termsVersion: REMOTIVE_TERMS_VERSION,
    requiredDestinationKind: REMOTIVE_REQUIRED_DESTINATION_KIND,
  },
  environment: {
    isEnabled: () => getServerEnvironment().REMOTIVE_SOURCE_ENABLED,
    message: "The reviewed Remotive source is disabled in this environment.",
  },
  snapshotKey: null,
  messages: {
    registryDisabled:
      "The reviewed Remotive source is disabled by the application source-policy registry.",
    policyPaused: "The reviewed Remotive source is paused or disabled.",
    snapshotStale: "The reviewed live source snapshot is too old to publish.",
    snapshotFuture:
      "The reviewed live source returned an invalid freshness time.",
    refreshFailed:
      "The reviewed live source could not be safely refreshed. Try again later.",
  },
  fetchJobs: async (requestedAt) => {
    const result = await fetchRemotiveJobs({
      fetch: createRemotiveProxyFetch(),
      requestedAt,
      signal: AbortSignal.timeout(10_000),
      requestInit: {
        headers: { Accept: "application/json" },
        next: {
          revalidate: REMOTIVE_SOURCE_POLICY.refreshIntervalSeconds,
          tags: [REMOTIVE_CACHE_TAG],
        },
      },
    });
    return { jobs: result.jobs, checkedAt: result.checkedAt };
  },
  failureCode: (reason) =>
    reason instanceof RemotiveAdapterError
      ? reason.code
      : "remotive_adapter_failed",
};

/**
 * Jobicy explicitly documents its feed for redistribution, so it needs no
 * environment kill switch; the application registry and the live operator
 * policy can each still stop acquisition independently.
 */
const jobicySourceDescriptor: SecondarySourceDescriptor = {
  key: "jobicy",
  reviewed: {
    adapterKey: JOBICY_ADAPTER_KEY,
    policy: JOBICY_SOURCE_POLICY,
    termsVersion: JOBICY_TERMS_VERSION,
    requiredDestinationKind: JOBICY_REQUIRED_DESTINATION_KIND,
  },
  snapshotKey: "jobicy",
  messages: {
    registryDisabled:
      "The reviewed Jobicy source is disabled by the application source-policy registry.",
    policyPaused: "The reviewed Jobicy source is paused or disabled.",
    snapshotStale: "The reviewed Jobicy snapshot is too old to publish.",
    snapshotFuture:
      "The reviewed Jobicy source returned invalid freshness evidence.",
    refreshFailed:
      "The reviewed Jobicy source could not be safely refreshed. Try again later.",
  },
  fetchJobs: async (requestedAt) => {
    const result = await fetchJobicyJobs({
      requestedAt,
      signal: AbortSignal.timeout(10_000),
      requestInit: {
        next: {
          revalidate: JOBICY_SOURCE_POLICY.refreshIntervalSeconds,
          tags: [JOBICY_CACHE_TAG],
        },
      },
    });
    return { jobs: result.jobs, checkedAt: result.checkedAt };
  },
  failureCode: (reason) =>
    reason instanceof JobicyAdapterError
      ? reason.code
      : "jobicy_adapter_failed",
};

/**
 * Himalayas is intentionally read-through only: records are attributed to
 * Himalayas and excluded from search indexing and downstream syndication. Its
 * paged fetch may legitimately return a partial page set, which is published
 * as a degraded (never silently complete) snapshot.
 */
const himalayasSourceDescriptor: SecondarySourceDescriptor = {
  key: "himalayas",
  reviewed: {
    adapterKey: HIMALAYAS_ADAPTER_KEY,
    policy: HIMALAYAS_SOURCE_POLICY,
    termsVersion: HIMALAYAS_TERMS_VERSION,
    requiredDestinationKind: HIMALAYAS_REQUIRED_DESTINATION_KIND,
  },
  snapshotKey: "himalayas",
  messages: {
    registryDisabled:
      "The reviewed Himalayas source is disabled by the application source-policy registry.",
    policyPaused: "The reviewed Himalayas source is paused or disabled.",
    snapshotStale: "The reviewed Himalayas snapshot is too old to publish.",
    snapshotFuture:
      "The reviewed Himalayas source returned invalid freshness evidence.",
    refreshFailed:
      "The reviewed Himalayas source could not be safely refreshed. Try again later.",
  },
  fetchJobs: async (requestedAt) => {
    const result = await fetchHimalayasJobs({
      requestedAt,
      // Six sequential paced page requests need more headroom than the
      // previous parallel fetch; this path only runs when no worker-written
      // snapshot is available.
      signal: AbortSignal.timeout(20_000),
      requestInit: {
        next: {
          revalidate: HIMALAYAS_SOURCE_POLICY.refreshIntervalSeconds,
          tags: [HIMALAYAS_CACHE_TAG],
        },
      },
    });
    return {
      jobs: result.jobs,
      checkedAt: result.checkedAt,
      ...(result.partial
        ? {
            degraded: {
              code: "himalayas_partial_snapshot",
              message: `Himalayas returned ${result.successfulRequestCount} of the ${HIMALAYAS_ENDPOINTS.length} reviewed result pages. Available jobs are shown as partial.`,
            },
          }
        : {}),
    };
  },
  failureCode: (reason) =>
    reason instanceof HimalayasAdapterError
      ? reason.code
      : "himalayas_adapter_failed",
};

export async function getRemotiveJobFeed(
  suppliedClient?: ServerSupabaseClient | null,
): Promise<SourceFeed> {
  return getSecondarySourceFeed(remotiveSourceDescriptor, suppliedClient);
}

export async function getJobicyJobFeed(
  suppliedClient?: ServerSupabaseClient | null,
): Promise<SourceFeed> {
  return getSecondarySourceFeed(jobicySourceDescriptor, suppliedClient);
}

export async function getHimalayasJobFeed(
  suppliedClient?: ServerSupabaseClient | null,
): Promise<SourceFeed> {
  return getSecondarySourceFeed(himalayasSourceDescriptor, suppliedClient);
}

export async function getLiveJobFeed(): Promise<JobFeedResult> {
  const [himalayas, jobicy, remotive, database] = await Promise.all([
    getHimalayasJobFeed(),
    getJobicyJobFeed(),
    getRemotiveJobFeed(),
    getDatabaseJobFeed(),
  ]);
  return combineJobSources([himalayas, jobicy, remotive, database]);
}

export async function getJobBySlug(
  slugOrId: string,
): Promise<{ feed: JobFeedResult; job: Job | null }> {
  const databaseResult = await getDatabaseJobBySlugResult(slugOrId);
  if (databaseResult.data) {
    const feed = combineJobSources([databaseDetailSource(databaseResult)]);
    return { feed, job: feed.jobs[0] ?? null };
  }

  const [himalayas, jobicy, remotive] = await Promise.all([
    getHimalayasJobFeed(),
    getJobicyJobFeed(),
    getRemotiveJobFeed(),
  ]);
  const candidate = [...himalayas.jobs, ...jobicy.jobs, ...remotive.jobs].find(
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
  const feed = combineJobSources([himalayas, jobicy, remotive, databaseSource]);
  return {
    feed,
    job:
      feed.jobs.find((job) => job.slug === slugOrId || job.id === slugOrId) ??
      null,
  };
}
