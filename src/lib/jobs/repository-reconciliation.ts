import { evaluateRemotePublication } from "./supply/remote-publication";
import { isJobCurrentlyPublishable } from "./publication";
import type { Job, JobFeedResult } from "./types";
import { sourceUnavailable, type SourceFeed } from "./repository-contracts";

const SOURCE_MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

function sourcePriority(job: Job) {
  if (job.source.type === "employer") return 4;
  if (job.source.type === "partner") return 3;
  if (job.source.type === "manual") return 2;
  return 1;
}

function overallCheckedAt(sources: SourceFeed[], fallback: Date): string {
  const values = sources
    .map(({ checkedAt }) => Date.parse(checkedAt))
    .filter(Number.isFinite);
  return new Date(
    values.length > 0 ? Math.min(...values) : fallback.valueOf(),
  ).toISOString();
}

function validateSourceEvidence(sources: SourceFeed[], now: Date) {
  const nowValue = now.valueOf();
  if (!Number.isFinite(nowValue)) throw new Error("invalid_job_feed_clock");
  const attemptedAt = now.toISOString();
  const byKey = new Map<SourceFeed["key"], SourceFeed>();
  for (const source of sources) {
    if (byKey.has(source.key)) {
      byKey.set(
        source.key,
        sourceUnavailable(
          source.key,
          attemptedAt,
          "duplicate_source_key",
          "The job source registry returned a duplicate source.",
        ),
      );
      continue;
    }
    const checkedAt = Date.parse(source.checkedAt);
    if (
      !Number.isFinite(checkedAt) ||
      checkedAt > nowValue + SOURCE_MAX_FUTURE_SKEW_MS
    ) {
      byKey.set(
        source.key,
        sourceUnavailable(
          source.key,
          attemptedAt,
          "source_checked_at_invalid",
          "The job source freshness evidence could not be verified.",
        ),
      );
      continue;
    }
    byKey.set(source.key, source);
  }
  return [...byKey.values()];
}

export function combineJobSources(
  sources: SourceFeed[],
  now = new Date(),
): JobFeedResult {
  const publicationSources = validateSourceEvidence(sources, now).map(
    (source) => {
      const jobs = source.jobs.filter(
        (job) =>
          isJobCurrentlyPublishable(job, now) &&
          // Reviewed secondary feeds use the same Africa-access publication
          // rule. It must not suppress moderated first-party employer
          // jobs, including legitimate onsite and hybrid roles in Nigeria.
          ((source.key !== "remotive" && source.key !== "jobicy") ||
            evaluateRemotePublication({
              arrangement: job.workMode,
              evidenceText: job.eligibility.evidenceText,
              verifiedAt: job.eligibility.lastVerifiedAt,
              workAuthorization: job.eligibility.workAuthorization,
            }).eligible),
      );
      return { ...source, jobs, count: jobs.length };
    },
  );
  const jobsByFingerprint = new Map<string, Job>();
  for (const source of publicationSources) {
    for (const job of source.jobs) {
      const current = jobsByFingerprint.get(job.fingerprint);
      if (!current || sourcePriority(job) > sourcePriority(current)) {
        jobsByFingerprint.set(job.fingerprint, job);
      }
    }
  }
  const jobs = [...jobsByFingerprint.values()];
  const sourceProblems = publicationSources.filter(
    ({ state }) => state === "unavailable" || state === "degraded",
  );
  const hasLiveSource = publicationSources.some(
    ({ state: sourceState }) => sourceState === "live",
  );
  const noSources = publicationSources.length === 0;
  const state: JobFeedResult["state"] =
    jobs.length > 0
      ? sourceProblems.length > 0
        ? "degraded"
        : "live"
      : noSources || sourceProblems.length > 0
        ? "unavailable"
        : !hasLiveSource &&
            publicationSources.some(
              ({ state: sourceState }) => sourceState === "disabled",
            )
          ? "disabled"
          : "live";
  const messageSources =
    state === "disabled"
      ? publicationSources.filter(
          ({ state: sourceState }) => sourceState !== "live",
        )
      : sourceProblems;
  const messages = messageSources
    .map(({ message }) => message)
    .filter((message): message is string => Boolean(message));
  if (noSources) messages.push("No job sources were supplied.");

  return {
    jobs,
    state,
    checkedAt: overallCheckedAt(publicationSources, now),
    ...(messages.length > 0 ? { message: messages.join(" ") } : {}),
    sources: publicationSources.map(
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
