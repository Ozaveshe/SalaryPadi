export const JOB_SUPPLY_SCHEDULES = {
  dispatcher: { cron: "*/15 * * * *", intervalMinutes: 15, jitterMinutes: 0 },
  licensed_incremental: {
    cron: "7 * * * *",
    intervalMinutes: 60,
    jitterMinutes: 0,
  },
  employer_ats: {
    cron: "2,17,32,47 * * * *",
    intervalMinutes: 15,
    jitterMinutes: 2,
    sourcePollMinutes: 120,
  },
  reliefweb_incremental: {
    cron: "29 */2 * * *",
    intervalMinutes: 120,
    jitterMinutes: 0,
  },
  reliefweb_full: {
    cron: "11 1 * * *",
    intervalMinutes: 1_440,
    jitterMinutes: 0,
  },
  remotive: {
    cron: "5 1,7,13,19 * * *",
    intervalMinutes: 360,
    jitterMinutes: 0,
  },
  jobicy: {
    cron: "35 1,7,13,19 * * *",
    intervalMinutes: 360,
    jitterMinutes: 0,
  },
  deadline_and_alerts: {
    cron: "*/15 * * * *",
    intervalMinutes: 15,
    jitterMinutes: 0,
  },
  apply_link_new: {
    cron: "8,23,38,53 * * * *",
    intervalMinutes: 15,
    jitterMinutes: 0,
  },
  apply_link_full: {
    cron: "41 2 * * *",
    intervalMinutes: 1_440,
    jitterMinutes: 0,
  },
  fuzzy_review: {
    cron: "13 3 * * *",
    intervalMinutes: 1_440,
    jitterMinutes: 0,
  },
  health_digest: {
    cron: "7 5 * * *",
    intervalMinutes: 1_440,
    jitterMinutes: 0,
  },
  rights_review: {
    cron: "19 6 1 * *",
    intervalMinutes: 43_200,
    jitterMinutes: 0,
  },
} as const;

export function effectivePollingSeconds(
  defaultSeconds: number,
  contractualMinimumSeconds: number | null,
) {
  if (!Number.isFinite(defaultSeconds) || defaultSeconds < 900) {
    throw new Error("invalid_default_polling_interval");
  }
  return Math.max(defaultSeconds, contractualMinimumSeconds ?? 0);
}

export function fullJitterDelayMs(
  attempt: number,
  baseMs: number,
  capMs: number,
  random: () => number = Math.random,
) {
  if (
    !Number.isInteger(attempt) ||
    attempt < 0 ||
    !Number.isFinite(baseMs) ||
    baseMs <= 0 ||
    !Number.isFinite(capMs) ||
    capMs < baseMs
  ) {
    throw new Error("invalid_retry_schedule");
  }
  const ceiling = Math.min(capMs, baseMs * 2 ** attempt);
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new Error("invalid_retry_random_sample");
  }
  return Math.floor(sample * ceiling);
}
