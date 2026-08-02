/**
 * Diversity-aware default ranking.
 *
 * Measured on 2026-08-02, three employers held 84.3% of the entire public
 * inventory — Renmoney 30.4%, Canonical 29.6%, Moniepoint 24.3%. Ranked
 * purely by relevance or recency, a first page of results is therefore
 * effectively one or two employers, and a job seeker concludes the platform
 * has nothing for them when in fact it has eight other employers further
 * down.
 *
 * This module interleaves the first N results so each employer appears at
 * most a few times, then appends everything else in its original order.
 * Nothing is hidden and nothing is reordered away: the complete result set is
 * still returned, and callers surface the remainder behind "more jobs from
 * this employer".
 */

export interface DiversifiableResult {
  /** Stable employer key. Results without one are never capped together. */
  employerKey: string | null;
}

export interface DiversityOptions {
  /** How many results the cap applies to. Beyond this, original order wins. */
  windowSize?: number;
  /** Maximum appearances per employer inside the window. */
  perEmployerCap?: number;
}

/** Defaults tuned to a 20-result first page at current concentration. */
export const DEFAULT_WINDOW_SIZE = 20;
export const DEFAULT_PER_EMPLOYER_CAP = 3;

export interface DiversityOutcome<T> {
  results: T[];
  /** Employers held back inside the window, and by how many. */
  deferred: { employerKey: string; deferredCount: number }[];
  /** True when the cap actually changed the order. */
  applied: boolean;
}

/**
 * Reorder so the leading window is not dominated by one employer.
 *
 * Stability matters: within an employer, the caller's original ordering is
 * preserved exactly, so relevance and recency still decide which of an
 * employer's jobs is shown first. The cap only decides how many of them
 * appear before other employers get a turn.
 */
export function diversifyResults<T extends DiversifiableResult>(
  results: readonly T[],
  options: DiversityOptions = {},
): DiversityOutcome<T> {
  const windowSize = options.windowSize ?? DEFAULT_WINDOW_SIZE;
  const cap = options.perEmployerCap ?? DEFAULT_PER_EMPLOYER_CAP;

  if (results.length <= 1 || cap <= 0 || windowSize <= 0) {
    return { results: [...results], deferred: [], applied: false };
  }

  const shown: T[] = [];
  const heldBack: T[] = [];
  const seen = new Map<string, number>();

  for (const result of results) {
    if (shown.length >= windowSize) {
      heldBack.push(result);
      continue;
    }
    const key = result.employerKey;
    if (key === null) {
      // No employer identity means nothing to concentrate; never capped.
      shown.push(result);
      continue;
    }
    const count = seen.get(key) ?? 0;
    if (count >= cap) {
      heldBack.push(result);
      continue;
    }
    seen.set(key, count + 1);
    shown.push(result);
  }

  const deferredCounts = new Map<string, number>();
  for (const result of heldBack) {
    const key = result.employerKey;
    if (key === null) continue;
    if ((seen.get(key) ?? 0) < cap) continue;
    deferredCounts.set(key, (deferredCounts.get(key) ?? 0) + 1);
  }

  const combined = [...shown, ...heldBack];
  const applied = combined.some((result, index) => result !== results[index]);

  return {
    results: combined,
    deferred: [...deferredCounts.entries()]
      .map(([employerKey, deferredCount]) => ({ employerKey, deferredCount }))
      .toSorted((a, b) => b.deferredCount - a.deferredCount),
    applied,
  };
}

export interface ConcentrationReading {
  employerKey: string;
  count: number;
  share: number;
}

export interface ConcentrationReport {
  total: number;
  distinctEmployers: number;
  /** Share held by the single largest employer. */
  topShare: number;
  /** Combined share of the three largest. */
  topThreeShare: number;
  readings: ConcentrationReading[];
  /** True when concentration has passed the alert threshold. */
  alert: boolean;
  reason: string;
}

/**
 * A single employer above this share of visible inventory, or three above the
 * combined threshold, is worth an operator's attention: it means the next
 * source outage or employer hiring freeze would visibly empty the site.
 */
export const TOP_EMPLOYER_ALERT_SHARE = 0.25;
export const TOP_THREE_ALERT_SHARE = 0.6;

export function measureConcentration(
  results: readonly DiversifiableResult[],
): ConcentrationReport {
  const counts = new Map<string, number>();
  for (const result of results) {
    const key = result.employerKey;
    if (key === null) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return {
      total: 0,
      distinctEmployers: 0,
      topShare: 0,
      topThreeShare: 0,
      readings: [],
      alert: false,
      reason: "No employer-attributed results to measure.",
    };
  }

  const readings = [...counts.entries()]
    .map(([employerKey, count]) => ({
      employerKey,
      count,
      share: count / total,
    }))
    .toSorted((a, b) => b.count - a.count);

  const topShare = readings[0]?.share ?? 0;
  const topThreeShare = readings
    .slice(0, 3)
    .reduce((sum, reading) => sum + reading.share, 0);

  const alert =
    topShare > TOP_EMPLOYER_ALERT_SHARE ||
    topThreeShare > TOP_THREE_ALERT_SHARE;

  return {
    total,
    distinctEmployers: readings.length,
    topShare,
    topThreeShare,
    readings,
    alert,
    reason: alert
      ? `Concentration high: largest employer ${(topShare * 100).toFixed(1)}%, top three ${(topThreeShare * 100).toFixed(1)}%.`
      : "Concentration within thresholds.",
  };
}
