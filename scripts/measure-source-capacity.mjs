/**
 * Measures observed per-source canonical yield so
 * `app.job_sources.expected_new_canonical_per_30d` can be recorded from evidence
 * instead of projection.
 *
 * `authorized_daily_capacity` sums `expected_new_canonical_per_30d` over runnable
 * sources that carry an `expected_capacity_evidence_ref`. That column is the
 * steady-state rate of NEW postings a board produces, which is not what a
 * board's first fetch shows: the first fetch backfills every role the board
 * already had open. Crediting a backfill spike as a daily rate would overstate
 * capacity by one to two orders of magnitude, so the first observed day of each
 * source is excluded from the rate and reported separately as backfill.
 *
 * A source qualifies only after a full pilot window of post-backfill
 * observation (`private.job_supply_targets.pilot_days`). Sources short of that
 * window are reported and deliberately left without evidence.
 *
 * This script never writes to the database. It prints a measurement report and,
 * with --emit-sql, writes reviewable `docs/data/` SQL for qualifying sources.
 *
 * Usage:
 *   SALARYPADI_DB_URL=... node scripts/measure-source-capacity.mjs
 *   SALARYPADI_DB_URL=... node scripts/measure-source-capacity.mjs --emit-sql
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;

export const EXIT_CODES = Object.freeze({
  ok: 0,
  usage: 1,
  no_qualifying_sources: 2,
});

export const TARGET_QUERY = `
select target_daily_new_canonical, pilot_days
from private.job_supply_targets
where id;
`;

export const RUNNABLE_COUNT_QUERY = `
select
  count(*)::integer as runnable,
  count(*) filter (where expected_capacity_evidence_ref is not null)::integer
    as with_evidence
from app.job_sources
where security.job_source_policy_is_runnable(id);
`;

/**
 * Counts only publicly remote-eligible canonical jobs, matching the filter
 * `api.get_job_supply_canary()` applies when it reports the target. Measuring a
 * broader population than the target counts would credit capacity the canary
 * will never see.
 *
 * Reports two independent readings of the same question, because neither works
 * everywhere:
 *
 * - `new_by_posted_at` counts roles the board says were posted on or after we
 *   first saw it. This is the definition we actually want and it is immune to
 *   how long our own ingestion took. It requires `posted_at`, which the Workable
 *   adapters populate and the Greenhouse adapters leave null.
 * - `new_by_day` counts roles first ingested after the first observed day. It
 *   works without `posted_at` but assumes the backfill completed within one day,
 *   which production has already violated: moniepoint_greenhouse ingested 22
 *   roles on 7/21 and another 49 on 7/22, all of them pre-existing.
 *
 * `classifySource` prefers the posted_at reading and falls back to the day
 * reading only when the source has no posting dates at all.
 */
export const MEASUREMENT_QUERY = `
with events as (
  select job.source_id, job.posted_at, event.created_at
  from audit.canonical_job_events event
  join app.jobs job on job.id = event.canonical_job_id
  where event.event_type = 'canonical_created'
    and security.job_is_public_remote_eligible(job.id)
),
first_seen as (
  select source_id, min(created_at) as first_seen_at,
    min(created_at)::date as backfill_day
  from events
  group by source_id
)
select
  source.adapter_key,
  source.expected_new_canonical_per_30d as recorded_expected,
  source.expected_capacity_evidence_ref as recorded_evidence,
  first_seen.backfill_day,
  (current_date - first_seen.backfill_day)::integer as observation_days,
  count(events.created_at)::integer as total_count,
  count(events.posted_at)::integer as with_posted_at,
  count(events.created_at) filter (
    where events.created_at::date = first_seen.backfill_day
  )::integer as backfill_count,
  count(events.created_at) filter (
    where events.created_at::date > first_seen.backfill_day
  )::integer as new_by_day,
  count(events.created_at) filter (
    where events.posted_at >= first_seen.first_seen_at
  )::integer as new_by_posted_at
from app.job_sources source
join first_seen on first_seen.source_id = source.id
left join events on events.source_id = source.id
where security.job_source_policy_is_runnable(source.id)
group by
  source.adapter_key,
  source.expected_new_canonical_per_30d,
  source.expected_capacity_evidence_ref,
  first_seen.backfill_day
order by source.adapter_key;
`;

/**
 * Scales the observed rate to 30 days and floors it. Per 30 days rather than
 * per day because an employer board yields well under one new role a day: a
 * board holding ~25 roles that stay open ~60 days produces about 0.4/day, which
 * an integer daily figure would record as 0. Flooring still applies, so a
 * source is never credited more than it demonstrated.
 */
export function observedRatePer30Days(steadyStateCount, observationDays) {
  if (!Number.isInteger(steadyStateCount) || steadyStateCount < 0) {
    throw new Error("steadyStateCount must be a non-negative integer");
  }
  if (!Number.isInteger(observationDays) || observationDays < 1) {
    throw new Error("observationDays must be a positive integer");
  }
  return Math.floor((steadyStateCount * 30) / observationDays);
}

/**
 * Prefers the board's own posting dates over our ingestion dates. The day-based
 * reading counts anything ingested after day one as new, so a backfill spread
 * across two days is credited as steady-state supply that does not exist.
 */
export function selectMeasurement(row) {
  if (row.with_posted_at === row.total_count && row.total_count > 0) {
    return { method: "posted_at", steady_state_count: row.new_by_posted_at };
  }
  return { method: "observed_day", steady_state_count: row.new_by_day };
}

export function classifySource(row, pilotDays) {
  if (!Number.isInteger(pilotDays) || pilotDays < 1) {
    throw new Error("pilotDays must be a positive integer");
  }
  const { method, steady_state_count } = selectMeasurement(row);
  if (row.observation_days < pilotDays) {
    return {
      ...row,
      method,
      steady_state_count,
      qualifies: false,
      reason: `observed ${row.observation_days}d of ${pilotDays}d pilot window`,
      observed_per_30d: null,
    };
  }
  return {
    ...row,
    method,
    steady_state_count,
    qualifies: true,
    reason:
      method === "posted_at"
        ? "full pilot window observed, measured by posting date"
        : "full pilot window observed, measured by ingestion day (no posting dates)",
    observed_per_30d: observedRatePer30Days(
      steady_state_count,
      row.observation_days,
    ),
  };
}

export function summarize(measured, target) {
  const classified = measured.map((row) =>
    classifySource(row, target.pilot_days),
  );
  const qualifying = classified.filter((row) => row.qualifies);
  const creditablePer30d = qualifying.reduce(
    (sum, row) => sum + row.observed_per_30d,
    0,
  );
  return {
    classified,
    qualifying,
    creditable_per_30d: creditablePer30d,
    // Matches how the three SQL readers derive authorized_daily_capacity: sum
    // the 30-day figures, then divide and floor once at the aggregate. Flooring
    // per source is what made every board count as zero.
    creditable_daily_capacity: Math.floor(creditablePer30d / 30),
    target_daily_new_canonical: target.target_daily_new_canonical,
  };
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function registrationSql(qualifying, measuredOn, target) {
  if (qualifying.length === 0) {
    throw new Error("registrationSql requires at least one qualifying source");
  }
  const statements = qualifying.map((row) => {
    const evidenceRef =
      `measured:${measuredOn}:${row.adapter_key}:` +
      `${row.steady_state_count}-new-over-${row.observation_days}d`;
    return [
      `-- ${row.adapter_key}: ${row.steady_state_count} new canonical over ${row.observation_days}d`,
      `--   (first-fetch backfill of ${row.backfill_count} on ${row.backfill_day} excluded)`,
      `update app.job_sources`,
      `set expected_new_canonical_per_30d = ${row.observed_per_30d},`,
      `    expected_capacity_evidence_ref = ${sqlLiteral(evidenceRef)},`,
      `    updated_at = now()`,
      `where adapter_key = ${sqlLiteral(row.adapter_key)};`,
    ].join("\n");
  });

  const creditedPer30d = qualifying.reduce(
    (sum, row) => sum + row.observed_per_30d,
    0,
  );
  const creditedDaily = Math.floor(creditedPer30d / 30);

  return [
    `-- Recorded source capacity measured on ${measuredOn}.`,
    `--`,
    `-- Produced by scripts/measure-source-capacity.mjs. Each figure is the`,
    `-- floor of observed new canonical jobs per 30 days over a completed`,
    `-- ${target.pilot_days}-day pilot window, excluding the first-fetch backfill.`,
    `-- No projection is credited: a source absent from this file has not`,
    `-- completed its window and is deliberately left without capacity evidence.`,
    `--`,
    `-- Credited capacity from this file: ${creditedPer30d} per 30d`,
    `--   which is ${creditedDaily}/day after the aggregate divide.`,
    `-- Daily canonical target: ${target.target_daily_new_canonical}/day.`,
    ``,
    `begin;`,
    ``,
    statements.join("\n\n"),
    ``,
    `commit;`,
    ``,
  ].join("\n");
}

export function formatReportRow(row) {
  const rate =
    row.observed_per_30d === null ? "--" : `${row.observed_per_30d}/30d`;
  const status = row.qualifies ? "QUALIFIES" : "PENDING  ";
  return (
    `${status} ${row.adapter_key.padEnd(34)} ` +
    `backfill=${String(row.backfill_count).padStart(4)} ` +
    `new=${String(row.steady_state_count).padStart(4)} ` +
    `days=${String(row.observation_days).padStart(3)} ` +
    `rate=${rate.padStart(8)} ` +
    `via=${row.method.padEnd(12)} ${row.reason}`
  );
}

async function readProduction(databaseUrl) {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 15_000,
    query_timeout: 60_000,
    statement_timeout: 60_000,
    application_name: "salarypadi-capacity-measurement",
  });
  await client.connect();
  try {
    const [targetResult, countResult, measuredResult] = await Promise.all([
      client.query(TARGET_QUERY),
      client.query(RUNNABLE_COUNT_QUERY),
      client.query(MEASUREMENT_QUERY),
    ]);
    return {
      target: targetResult.rows[0],
      counts: countResult.rows[0],
      measured: measuredResult.rows,
    };
  } finally {
    await client.end();
  }
}

export async function runCli({
  environment = process.env,
  argv = process.argv.slice(2),
  write = (line) => console.log(line),
  writeError = (line) => console.error(line),
  read = readProduction,
  measuredOn = new Date().toISOString().slice(0, 10),
} = {}) {
  const databaseUrl = environment.SALARYPADI_DB_URL?.trim();
  if (!databaseUrl) {
    writeError("SALARYPADI_DB_URL is required");
    return EXIT_CODES.usage;
  }

  const report = await read(databaseUrl);
  if (!report.target) {
    writeError("private.job_supply_targets has no row");
    return EXIT_CODES.usage;
  }

  const summary = summarize(report.measured, report.target);

  write(
    `Runnable sources: ${report.counts.runnable} ` +
      `(${report.counts.with_evidence} carry capacity evidence today)`,
  );
  write(`Sources with any canonical yield observed: ${report.measured.length}`);
  write(`Pilot window: ${report.target.pilot_days} days`);
  write("");
  for (const row of summary.classified) {
    write(formatReportRow(row));
  }
  write("");
  write(
    `Qualifying sources: ${summary.qualifying.length} of ${report.measured.length}`,
  );
  write(
    `Evidence-backed capacity available to credit: ` +
      `${summary.creditable_per_30d} per 30d ` +
      `(${summary.creditable_daily_capacity}/day) against a ` +
      `${summary.target_daily_new_canonical}/day target`,
  );

  if (summary.qualifying.length === 0) {
    write("");
    write(
      "No source has completed its pilot window, so no capacity evidence can " +
        "be recorded. job_supply stays capacity_unproven, which is the " +
        "truthful state.",
    );
    return EXIT_CODES.no_qualifying_sources;
  }

  if (argv.includes("--emit-sql")) {
    const target = path.resolve(
      process.cwd(),
      `docs/data/${measuredOn.replaceAll("-", "")}_source_capacity_evidence.sql`,
    );
    await writeFile(
      target,
      registrationSql(summary.qualifying, measuredOn, report.target),
      "utf8",
    );
    write("");
    write(`Wrote ${target} for review. It is not applied by this script.`);
  }

  return EXIT_CODES.ok;
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entrypoint === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli();
}
