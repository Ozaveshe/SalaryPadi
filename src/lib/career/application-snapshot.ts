/**
 * The job as the user saw it when they applied.
 *
 * An application tracker that renders from the live job row is not a record,
 * it is a mirror. When the employer retitles a role, changes the salary, or
 * the posting is purged, the user's own history changes underneath them — and
 * they are the one person who cannot be wrong about what they applied to.
 *
 * The snapshot is written once and never updated. Job closure is tracked
 * separately on the live job, so a role can show as closed *today* without
 * disturbing what was true when the person applied.
 */

import { z } from "zod";

export const applicationJobSnapshotSchema = z
  .object({
    /** Canonical job id, so the record survives a slug change. */
    jobId: z.string().min(1),
    slug: z.string().min(1).nullable(),
    title: z.string().min(1).max(300),
    companyName: z.string().min(1).max(300),
    companySlug: z.string().min(1).max(160).nullable(),
    locationDisplay: z.string().max(300).nullable(),
    workArrangement: z.string().max(60).nullable(),
    employmentType: z.string().max(60).nullable(),
    /** The salary exactly as displayed, or null when none was shown. */
    salaryDisplay: z.string().max(300).nullable(),
    /** Where Apply actually sent them. */
    applicationUrl: z.string().max(2000).nullable(),
    /** What the job page said about Nigeria eligibility at the time. */
    eligibilitySummary: z.string().max(300).nullable(),
    /** When SalaryPadi had last confirmed the job when they applied. */
    lastCheckedAt: z.string().nullable(),
  })
  .strict();

export type ApplicationJobSnapshot = z.infer<
  typeof applicationJobSnapshotSchema
>;

export interface SnapshotSourceJob {
  id: string;
  slug?: string | null;
  title: string;
  company: { name: string; slug?: string | null };
  locationDisplay?: string | null;
  workMode?: string | null;
  employmentType?: string | null;
  salary?: { originalText?: string | null } | null;
  applicationUrl?: string | null;
  eligibility?: { summary?: string | null } | null;
  lastCheckedAt?: string | null;
}

function trim(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const cleaned = value.trim().slice(0, max);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Build the snapshot from the job the user is looking at.
 *
 * Nothing is inferred or filled in: a field the page did not show is stored
 * as null, because "the posting did not state a salary" is itself part of
 * what the person saw and worth preserving.
 */
export function buildApplicationSnapshot(
  job: SnapshotSourceJob,
): ApplicationJobSnapshot {
  return {
    jobId: job.id,
    slug: trim(job.slug, 200),
    title: job.title.trim().slice(0, 300),
    companyName: job.company.name.trim().slice(0, 300),
    companySlug: trim(job.company.slug, 160),
    locationDisplay: trim(job.locationDisplay, 300),
    workArrangement: trim(job.workMode, 60),
    employmentType: trim(job.employmentType, 60),
    salaryDisplay: trim(job.salary?.originalText, 300),
    applicationUrl: trim(job.applicationUrl, 2000),
    eligibilitySummary: trim(job.eligibility?.summary, 300),
    lastCheckedAt: job.lastCheckedAt ?? null,
  };
}

export type SnapshotReadResult =
  | { state: "snapshot"; snapshot: ApplicationJobSnapshot; capturedAt: string }
  | { state: "invalid" }
  | { state: "absent" };

/**
 * Read a stored snapshot.
 *
 * A malformed snapshot returns `invalid` rather than throwing or being
 * silently repaired: the caller falls back to showing what it can and says
 * the historical detail is unavailable, which is honest. Quietly substituting
 * live job data would recreate the exact problem snapshots exist to solve.
 */
export function readApplicationSnapshot(
  raw: unknown,
  capturedAt: string | null,
): SnapshotReadResult {
  if (raw === null || raw === undefined) return { state: "absent" };
  if (!capturedAt) return { state: "invalid" };
  const parsed = applicationJobSnapshotSchema.safeParse(raw);
  if (!parsed.success) return { state: "invalid" };
  return { state: "snapshot", snapshot: parsed.data, capturedAt };
}

export interface ApplicationDisplay {
  title: string;
  companyName: string;
  companySlug: string | null;
  locationDisplay: string | null;
  salaryDisplay: string | null;
  /** True when these values came from the historical snapshot. */
  fromSnapshot: boolean;
  /** Set when the live job now differs from what was recorded. */
  changedSinceApplied: string[];
}

/**
 * What to render for one tracked application.
 *
 * The snapshot always wins. The live job is used only to *notice* a change
 * and mention it — never to overwrite the record. Someone who applied to
 * "Senior Analyst at ₦600k" should still see that, plus a note that the
 * posting has since been retitled, rather than silently seeing new text.
 */
export function resolveApplicationDisplay(
  snapshotResult: SnapshotReadResult,
  liveJob: SnapshotSourceJob | null,
): ApplicationDisplay | null {
  if (snapshotResult.state === "snapshot") {
    const snapshot = snapshotResult.snapshot;
    const changed: string[] = [];
    if (liveJob) {
      if (liveJob.title.trim() !== snapshot.title) {
        changed.push("The role title has changed since you applied.");
      }
      const liveSalary = trim(liveJob.salary?.originalText, 300);
      if (liveSalary !== snapshot.salaryDisplay) {
        changed.push("The advertised pay has changed since you applied.");
      }
      if (liveJob.company.name.trim() !== snapshot.companyName) {
        changed.push("The employer name has changed since you applied.");
      }
    }
    return {
      title: snapshot.title,
      companyName: snapshot.companyName,
      companySlug: snapshot.companySlug,
      locationDisplay: snapshot.locationDisplay,
      salaryDisplay: snapshot.salaryDisplay,
      fromSnapshot: true,
      changedSinceApplied: changed,
    };
  }

  // No usable snapshot — applications recorded before snapshots existed, or a
  // corrupted one. Fall back to the live job and be clear it is not history.
  if (!liveJob) return null;
  return {
    title: liveJob.title,
    companyName: liveJob.company.name,
    companySlug: liveJob.company.slug ?? null,
    locationDisplay: liveJob.locationDisplay ?? null,
    salaryDisplay: liveJob.salary?.originalText ?? null,
    fromSnapshot: false,
    changedSinceApplied: [],
  };
}
