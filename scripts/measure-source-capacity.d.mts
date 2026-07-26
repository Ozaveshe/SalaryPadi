export type MeasurementMethod = "posted_at" | "observed_day";

export type MeasuredSourceRow = {
  adapter_key: string;
  recorded_expected: number | null;
  recorded_evidence: string | null;
  backfill_day: string;
  observation_days: number;
  total_count: number;
  with_posted_at: number;
  backfill_count: number;
  new_by_day: number;
  new_by_posted_at: number;
};

export type SupplyTarget = {
  target_daily_new_canonical: number;
  pilot_days: number;
};

export type ClassifiedSourceRow = MeasuredSourceRow & {
  method: MeasurementMethod;
  steady_state_count: number;
  qualifies: boolean;
  reason: string;
  observed_per_30d: number | null;
};

export type CapacitySummary = {
  classified: ClassifiedSourceRow[];
  qualifying: ClassifiedSourceRow[];
  creditable_per_30d: number;
  creditable_daily_capacity: number;
  target_daily_new_canonical: number;
};

export type CapacityReport = {
  target: SupplyTarget | undefined;
  counts: { runnable: number; with_evidence: number };
  measured: MeasuredSourceRow[];
};

export const EXIT_CODES: Readonly<Record<string, number>>;
export const TARGET_QUERY: string;
export const RUNNABLE_COUNT_QUERY: string;
export const MEASUREMENT_QUERY: string;

export function observedRatePer30Days(
  steadyStateCount: number,
  observationDays: number,
): number;

export function selectMeasurement(row: MeasuredSourceRow): {
  method: MeasurementMethod;
  steady_state_count: number;
};

export function classifySource(
  row: MeasuredSourceRow,
  pilotDays: number,
): ClassifiedSourceRow;

export function summarize(
  measured: MeasuredSourceRow[],
  target: SupplyTarget,
): CapacitySummary;

export function registrationSql(
  qualifying: ClassifiedSourceRow[],
  measuredOn: string,
  target: SupplyTarget,
): string;

export function formatReportRow(row: ClassifiedSourceRow): string;

export function runCli(options?: {
  environment?: Record<string, string | undefined>;
  argv?: string[];
  write?: (line: string) => void;
  writeError?: (line: string) => void;
  read?: (databaseUrl: string) => Promise<CapacityReport>;
  measuredOn?: string;
}): Promise<number>;
