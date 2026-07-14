import type { Job } from "./types";

export const JOB_PUBLICATION_MAX_FUTURE_SKEW_MS = 5 * 60_000;

/**
 * A job is publishable only while its lifecycle and source evidence describe a
 * coherent current record. All public consumers use this predicate so an
 * expired or future-dated row cannot survive through a less strict surface.
 */
export function isJobCurrentlyPublishable(job: Job, now = new Date()) {
  if (job.status !== "open") return false;

  const nowValue = now.valueOf();
  if (!Number.isFinite(nowValue)) return false;
  const latestAllowedEvidence = nowValue + JOB_PUBLICATION_MAX_FUTURE_SKEW_MS;
  const evidenceTimes = [
    Date.parse(job.postedAt),
    Date.parse(job.lastCheckedAt),
    Date.parse(job.eligibility.lastVerifiedAt),
  ];
  if (
    evidenceTimes.some(
      (timestamp) =>
        !Number.isFinite(timestamp) || timestamp > latestAllowedEvidence,
    )
  ) {
    return false;
  }

  if (!job.validThrough) return true;
  const validThrough = Date.parse(job.validThrough);
  return Number.isFinite(validThrough) && validThrough > nowValue;
}
