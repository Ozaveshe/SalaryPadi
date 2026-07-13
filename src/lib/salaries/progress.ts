export type SalaryProgressStatus =
  "none" | "fewer_than_threshold" | "threshold_met";

export interface SalaryCellProgress {
  roleSlug: string;
  roleFamily: string;
  countryCode: string;
  displayedContributions: number | null;
  privacyThreshold: number;
  status: SalaryProgressStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Fail closed if SQL ever returns an exact sub-threshold value. */
export function parseSalaryCellProgress(
  row: unknown,
): SalaryCellProgress | null {
  if (
    !isRecord(row) ||
    typeof row.role_slug !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.role_slug) ||
    typeof row.role_family !== "string" ||
    row.role_family.length < 2 ||
    typeof row.country_code !== "string" ||
    !/^[A-Z]{2}$/.test(row.country_code) ||
    typeof row.privacy_threshold !== "number" ||
    !Number.isInteger(row.privacy_threshold) ||
    row.privacy_threshold < 3 ||
    (row.progress_status !== "none" &&
      row.progress_status !== "fewer_than_threshold" &&
      row.progress_status !== "threshold_met")
  ) {
    return null;
  }

  const displayed = row.displayed_contributions;
  const validDisplay =
    (row.progress_status === "none" && displayed === 0) ||
    (row.progress_status === "fewer_than_threshold" && displayed === null) ||
    (row.progress_status === "threshold_met" &&
      displayed === row.privacy_threshold);
  if (!validDisplay) return null;

  return {
    roleSlug: row.role_slug,
    roleFamily: row.role_family,
    countryCode: row.country_code,
    displayedContributions: displayed,
    privacyThreshold: row.privacy_threshold,
    status: row.progress_status,
  };
}

export function salaryProgressCopy(progress: SalaryCellProgress): {
  heading: string;
  detail: string;
} {
  if (progress.status === "none") {
    return {
      heading: `0 of ${progress.privacyThreshold} approved contributions available`,
      detail: `At least ${progress.privacyThreshold} compatible contributions from distinct accounts are needed before an aggregate can be published.`,
    };
  }
  if (progress.status === "fewer_than_threshold") {
    return {
      heading: `Fewer than ${progress.privacyThreshold} approved contributions available`,
      detail:
        "The exact sub-threshold count stays private. Company-level progress is never exposed.",
    };
  }
  return {
    heading: `${progress.privacyThreshold} of ${progress.privacyThreshold} contribution threshold met`,
    detail:
      "A compatible broad cell has reached the threshold and is awaiting the next privacy-safe aggregate refresh.",
  };
}
