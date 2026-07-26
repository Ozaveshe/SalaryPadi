/**
 * Measures observed per-source canonical yield so
 * `app.job_sources.expected_daily_new_canonical` can be recorded from evidence
 * instead of projection.
 *
 * `authorized_daily_capacity` sums `expected_daily_new_canonical` over runnable
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
 */
export const MEASUREMENT_QUERY = `
with events as (
  select job.source_id, event.created_at
  from audit.canonical_job_events event
  join app.jobs job on job.id = event.canonical_job_id
  where event.event_type = 'canonical_created'
    and security.job_is_public_remote_eligible(job.id)
),
first_day as (
  select source_id, min(created_at)::date as backfill_day
  from events
  group by source_id
)
select
  source.adapter_key,
  source.expected_daily_new_canonical as recorded_expected,
  source.expected_capacity_evidence_ref as recorded_evidence,
  first_day.backfill_day,
  (current_date - first_day.backfill_day)::integer as observation_days,
  count(events.created_at) filter (
    where events.created_at::date = first_day.backfill_day
  )::integer as backfill_count,
  count(events.created_at) filter (
    where events.created_at::date > first_day.backfill_day
  )::integer as steady_state_count
from app.job_sources source
join first_day on first_day.source_id = source.id
left join events on events.source_id = source.id
where security.job_source_policy_is_runnable(source.id)
group by
  source.adapter_key,
  source.expected_daily_new_canonical,
  source.expected_capacity_evidence_ref,
  first_day.backfill_day
order by source.adapter_key;
`;

/**
 * Floors the observed rate so a partial posting never rounds up into credited
 * capacity. A source that produced fewer new roles than its window has days
 * measures as 0/day, which is the honest reading: its steady-state contribution
 * is below one per day and must not be credited as one.
 */
export function observedDailyRate(steadyStateCount, observationDays) {
  if (!Number.isInteger(steadyStateCount) || steadyStateCount < 0) {
    throw new Error("steadyStateCount must be a non-negative integer");
  }
  if (!Number.isInteger(observationDays) || observationDays < 1) {
    throw new Error("observationDays must be a positive integer");
  }
  return Math.floor(steadyStateCount / observationDays);
}

export function classifySource(row, pilotDays) {
  if (!Number.isInteger(pilotDays) || pilotDays < 1) {
    throw new Error("pilotDays must be a positive integer");
  }
  if (row.observation_days < pilotDays) {
    return {
      ...row,
      qualifies: false,
      reason: `observed ${row.observation_days}d of ${pilotDays}d pilot window`,
      observed_daily: null,
    };
  }
  return {
    ...row,
    qualifies: true,
    reason: "full pilot window observed",
    observed_daily: observedDailyRate(
      row.steady_state_count,
      row.observation_days,
    ),
  };
}

export function summarize(measured, target) {
  const classified = measured.map((row) =>
    classifySource(row, target.pilot_days),
  );
  const qualifying = classified.filter((row) => row.qualifies);
  return {
    classified,
    qualifying,
    creditable_daily_capacity: qualifying.reduce(
      (sum, row) => sum + row.observed_daily,
      0,
    ),
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
      `set expected_daily_new_canonical = ${row.observed_daily},`,
      `    expected_capacity_evidence_ref = ${sqlLiteral(evidenceRef)},`,
      `    updated_at = now()`,
      `where adapter_key = ${sqlLiteral(row.adapter_key)};`,
    ].join("\n");
  });

  const credited = qualifying.reduce((sum, row) => sum + row.observed_daily, 0);

  return [
    `-- Recorded source capacity measured on ${measuredOn}.`,
    `--`,
    `-- Produced by scripts/measure-source-capacity.mjs. Each figure is the`,
    `-- floor of observed new canonical jobs per day over a completed`,
    `-- ${target.pilot_days}-day pilot window, excluding the first-fetch backfill.`,
    `-- No projection is credited: a source absent from this file has not`,
    `-- completed its window and is deliberately left without capacity evidence.`,
    `--`,
    `-- Credited capacity from this file: ${credited}/day.`,
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
  const rate = row.observed_daily === null ? "--" : `${row.observed_daily}/day`;
  const status = row.qualifies ? "QUALIFIES" : "PENDING  ";
  return (
    `${status} ${row.adapter_key.padEnd(34)} ` +
    `backfill=${String(row.backfill_count).padStart(4)} ` +
    `new=${String(row.steady_state_count).padStart(4)} ` +
    `days=${String(row.observation_days).padStart(3)} ` +
    `rate=${rate.padStart(8)}  ${row.reason}`
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
      `${summary.creditable_daily_capacity}/day against a ` +
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
