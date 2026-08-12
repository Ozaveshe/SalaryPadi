import "server-only";

import { cache } from "react";
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
import { fetchReliefWebJobs, ReliefWebAdapterError } from "./reliefweb-adapter";
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
  RELIEFWEB_ADAPTER_KEY,
  RELIEFWEB_CACHE_TAG,
  RELIEFWEB_REQUIRED_DESTINATION_KIND,
  RELIEFWEB_SOURCE_POLICY,
  RELIEFWEB_TERMS_VERSION,
  REMOTIVE_ADAPTER_KEY,
  REMOTIVE_CACHE_TAG,
  REMOTIVE_REQUIRED_DESTINATION_KIND,
  REMOTIVE_SOURCE_POLICY,
  REMOTIVE_TERMS_VERSION,
} from "./source-policy";
import { openSupplyAdapter } from "./supply/adapters";
import { AdapterPolicyError } from "./supply/policy";
import type { Job, JobFeedResult } from "./types";

export {
  getDatabaseJobBySlugResult,
  getDatabaseRelatedJobsResult,
} from "./repository-database";

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

/**
 * How long one source may take while a person is waiting for the page.
 *
 * Measured against production: the reviewed provider APIs answer in under
 * half a second and the public job projection plans in about 45ms, yet
 * assembling the feed stalled the response for six and a half seconds in a
 * single unbroken wait. The per-source timeouts are sized for the scheduled
 * workers (up to twenty seconds), which is correct for a worker and far too
 * long for a page render.
 *
 * A source that misses this budget is reported as unavailable, which the feed
 * already models honestly: the page renders what did answer, says the set is
 * partial, and names the source that did not. That is a better answer than a
 * complete list nobody waited for.
 */
const REQUEST_SOURCE_BUDGET_MS = 2_500;

/** Only log an assembly that a person would actually notice waiting for. */
const SLOW_FEED_LOG_THRESHOLD_MS = 750;

/**
 * Resolves to the source's own result, or to an honest unavailable record once
 * the request budget expires. The slow work is abandoned rather than awaited;
 * its own timeout still bounds it, and its result is discarded.
 */
function withRequestBudget(
  key: SourceFeed["key"],
  attemptedAt: string,
  work: Promise<SourceFeed>,
): Promise<SourceFeed> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<SourceFeed>((resolve) => {
    timer = setTimeout(
      () =>
        resolve(
          sourceUnavailable(
            key,
            attemptedAt,
            `${key}_request_budget_exceeded`,
            "This source did not answer quickly enough to be included on this page.",
          ),
        ),
      REQUEST_SOURCE_BUDGET_MS,
    );
  });
  return Promise.race([work, budget]).finally(() => clearTimeout(timer));
}

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
    // Deliberately does NOT force `cache: "no-store"`. The caller supplies
    // `next.revalidate` and a cache tag so this hop is served from the data
    // cache for the source's reviewed refresh interval; overriding it here
    // opted every render back out, so each page view paid an HTTPS round trip
    // to our own function plus a durable fetch-budget write before the
    // provider was even contacted.
    return fetch(endpoint, {
      ...init,
      headers,
      credentials: "omit",
      redirect: "error",
    });
  };
}

/**
 * One Supabase client per request, shared by every source in the feed.
 *
 * Assembling the feed touches five sources, and each used to build its own
 * client — five cookie reads and five connections for one page. Memoising per
 * request also gives the batched policy read below a stable cache key. A
 * rejected creation is memoised too, so each caller still sees the same
 * failure its own handler already expects.
 */
const getRequestSupabaseClient = cache(
  async (): Promise<ServerSupabaseClient | null> =>
    await createServerSupabaseClient(),
);

async function resolveClient(
  supplied: ServerSupabaseClient | null | undefined,
): Promise<ServerSupabaseClient | null> {
  return supplied === undefined ? await getRequestSupabaseClient() : supplied;
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

/** Every adapter key the public feed can ask the live registry about. */
const REVIEWED_ADAPTER_KEYS = [
  REMOTIVE_ADAPTER_KEY,
  JOBICY_ADAPTER_KEY,
  HIMALAYAS_ADAPTER_KEY,
  RELIEFWEB_ADAPTER_KEY,
] as const;

/**
 * Reads every reviewed registry row in one request.
 *
 * Each source used to issue its own `eq(adapter_key)` query, so assembling the
 * feed cost four round trips to `api.job_sources` for four rows of the same
 * small table. Memoised on the request-scoped client, so a page that reaches
 * the feed from more than one place still reads the registry once.
 */
const readSourcePolicyRows = cache(async (supabase: ServerSupabaseClient) =>
  supabase
    .schema("api")
    .from("job_sources")
    .select(REVIEWED_POLICY_SELECT_COLUMNS)
    .in("adapter_key", [...REVIEWED_ADAPTER_KEYS])
    .abortSignal(AbortSignal.timeout(4_000)),
);

/**
 * The registry row for one adapter, shaped like the `maybeSingle()` result the
 * callers already handle: `data` is null when the source has no row, and an
 * `error` propagates the whole batched read's failure.
 */
async function readSourcePolicyRow(
  supabase: ServerSupabaseClient,
  adapterKey: string,
) {
  const { data, error } = await readSourcePolicyRows(supabase);
  if (error) return { data: null, error };
  const row =
    data?.find((candidate) => candidate.adapter_key === adapterKey) ?? null;
  return { data: row, error: null };
}

type SecondarySourceKey = "remotive" | "jobicy" | "himalayas" | "reliefweb";

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
    /*
     * No fresh snapshot, and rendering a page is not the place to go and get
     * one. Falling through to a live provider fetch here is what made public
     * latency a function of provider latency: the homepage was measured at
     * 4.9s against a 0.7s baseline, because a stale snapshot silently turned
     * every request into an outbound call.
     *
     * The scheduled worker owns acquisition. A request reports the source as
     * delayed, the page keeps serving everything else it has, and the
     * freshness classifier turns that into "some sources are delayed" rather
     * than into a smaller job count presented as fact.
     */
    return sourceUnavailable(
      key,
      attemptedAt,
      `${key}_awaiting_refresh`,
      messages.snapshotStale,
    );
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

/**
 * ReliefWeb ships dark: the registry entry is disabled pending the approved
 * appname, the environment kill switch defaults off, and no database policy
 * row exists. All three must independently open before a request is made,
 * and the adapter itself refuses to run without the appname credential.
 */
const reliefWebSourceDescriptor: SecondarySourceDescriptor = {
  key: "reliefweb",
  reviewed: {
    adapterKey: RELIEFWEB_ADAPTER_KEY,
    policy: RELIEFWEB_SOURCE_POLICY,
    termsVersion: RELIEFWEB_TERMS_VERSION,
    requiredDestinationKind: RELIEFWEB_REQUIRED_DESTINATION_KIND,
  },
  environment: {
    isEnabled: () => getServerEnvironment().RELIEFWEB_SOURCE_ENABLED,
    message: "The reviewed ReliefWeb source is disabled in this environment.",
  },
  snapshotKey: null,
  messages: {
    registryDisabled:
      "The reviewed ReliefWeb source is disabled by the application source-policy registry.",
    policyPaused: "The reviewed ReliefWeb source is paused or disabled.",
    snapshotStale: "The reviewed ReliefWeb snapshot is too old to publish.",
    snapshotFuture:
      "The reviewed ReliefWeb source returned invalid freshness evidence.",
    refreshFailed:
      "The reviewed ReliefWeb source could not be safely refreshed. Try again later.",
  },
  fetchJobs: async (requestedAt) => {
    const result = await fetchReliefWebJobs({
      appName: getServerEnvironment().RELIEFWEB_APP_NAME,
      requestedAt,
      signal: AbortSignal.timeout(10_000),
      requestInit: {
        next: {
          revalidate: RELIEFWEB_SOURCE_POLICY.refreshIntervalSeconds,
          tags: [RELIEFWEB_CACHE_TAG],
        },
      },
    });
    return { jobs: result.jobs, checkedAt: result.checkedAt };
  },
  failureCode: (reason) =>
    reason instanceof ReliefWebAdapterError
      ? reason.code
      : "reliefweb_adapter_failed",
};

export async function getReliefWebJobFeed(
  suppliedClient?: ServerSupabaseClient | null,
): Promise<SourceFeed> {
  return getSecondarySourceFeed(reliefWebSourceDescriptor, suppliedClient);
}

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

/**
 * The combined public job feed, assembled at most once per request.
 *
 * This is the most expensive read in the product: five sources, a registry
 * read and up to four provider fetches. It is reachable from a page, from a
 * nested component and from the company directory, so an uncached call did
 * the whole thing again for every route that composed two of them — the
 * companies page had already worked around this with its own local cache().
 * Memoising at the source means every caller shares one assembly.
 */
export const getLiveJobFeed = cache(async (): Promise<JobFeedResult> => {
  // Resolve the client once and hand the same one to every source. On failure
  // pass `undefined` so each source resolves (and reports) independently,
  // exactly as it did when each built its own.
  let shared: ServerSupabaseClient | null | undefined;
  try {
    shared = await getRequestSupabaseClient();
  } catch {
    shared = undefined;
  }
  const attemptedAt = new Date().toISOString();
  const startedAt = performance.now();
  const durations: Record<string, number> = {};
  const timed = (key: SourceFeed["key"], work: Promise<SourceFeed>) => {
    const sourceStartedAt = performance.now();
    return withRequestBudget(key, attemptedAt, work).then((feed) => {
      durations[key] = Math.round(performance.now() - sourceStartedAt);
      return feed;
    });
  };

  const [himalayas, jobicy, remotive, reliefweb, database] = await Promise.all([
    timed("himalayas", getHimalayasJobFeed(shared)),
    timed("jobicy", getJobicyJobFeed(shared)),
    timed("remotive", getRemotiveJobFeed(shared)),
    timed("reliefweb", getReliefWebJobFeed(shared)),
    timed("database", getDatabaseJobFeed()),
  ]);

  // One structured line per assembly. Page latency is dominated by whichever
  // source is slowest, and that was previously invisible in production: the
  // only way to attribute the wait was to guess from the outside.
  const totalMs = Math.round(performance.now() - startedAt);
  if (totalMs >= SLOW_FEED_LOG_THRESHOLD_MS) {
    console.warn(
      JSON.stringify({
        event: "jobs.feed_assembled",
        total_ms: totalMs,
        budget_ms: REQUEST_SOURCE_BUDGET_MS,
        source_ms: durations,
      }),
    );
  }
  return combineJobSources([himalayas, jobicy, remotive, reliefweb, database]);
});

/**
 * Memoised per request: every job detail page resolves the same slug twice,
 * once in generateMetadata and once in the page body, and a cache miss here
 * costs a database lookup plus all four secondary feeds.
 */
export const getJobBySlug = cache(async function getJobBySlug(
  slugOrId: string,
): Promise<{ feed: JobFeedResult; job: Job | null }> {
  const databaseResult = await getDatabaseJobBySlugResult(slugOrId);
  if (databaseResult.data) {
    const feed = combineJobSources([databaseDetailSource(databaseResult)]);
    return { feed, job: feed.jobs[0] ?? null };
  }

  const [himalayas, jobicy, remotive, reliefweb] = await Promise.all([
    getHimalayasJobFeed(),
    getJobicyJobFeed(),
    getRemotiveJobFeed(),
    getReliefWebJobFeed(),
  ]);
  const candidate = [
    ...himalayas.jobs,
    ...jobicy.jobs,
    ...remotive.jobs,
    ...reliefweb.jobs,
  ].find((job) => job.slug === slugOrId || job.id === slugOrId);
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
  const feed = combineJobSources([
    himalayas,
    jobicy,
    remotive,
    reliefweb,
    databaseSource,
  ]);
  return {
    feed,
    job:
      feed.jobs.find((job) => job.slug === slugOrId || job.id === slugOrId) ??
      null,
  };
});
