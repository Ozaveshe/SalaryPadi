-- Record source capacity per 30 days instead of per day, and set the daily
-- canonical target to a figure the roster can actually prove.
--
-- expected_daily_new_canonical was an integer count of new canonical jobs per
-- day. That unit cannot represent an employer ATS board. Measured in production
-- on 2026-07-26: a board holds ~25 open roles, and the roles that carry posting
-- dates have a median age of 31.6 days and a mean of 87.1. By Little's law a
-- board of that shape yields roughly 0.15-0.4 new roles per day. Every board
-- therefore rounds to 0 in an integer daily column, and summing 108 zeros gives
-- an authorized capacity of 0 no matter how much real supply exists.
--
-- Storing the same rate over 30 days keeps the column an honest integer while
-- letting a sub-daily source count for something: 0.4/day becomes 12 per 30d.
-- The three readers now divide by 30 and floor, so the aggregate still never
-- overstates capacity; only the per-source rounding loss is removed.
--
-- The 500/day target was set on 2026-07-14 with no recorded evidence behind the
-- number. The same measurement puts a fully cycled 108-board roster at roughly
-- 15-45 new canonical jobs/day, so 500 could not be reached or approached and
-- the supply gate could never do its job as an alarm. 50/day sits just above
-- today's measured ceiling: reachable with modest roster growth, and a breach
-- means something is actually wrong.

begin;

alter table app.job_sources
  add column if not exists expected_new_canonical_per_30d integer;

comment on column app.job_sources.expected_new_canonical_per_30d is
  'Evidence-backed count of new canonical jobs this source yields per 30 days. '
  'Per 30 days rather than per day because an employer board yields well under '
  'one role a day and would round to zero. Requires expected_capacity_evidence_ref.';

-- Carry over any daily figure at the same rate. Production holds none today
-- (no source has ever had capacity evidence recorded), so this is a no-op there
-- and correctness insurance anywhere else.
update app.job_sources
set expected_new_canonical_per_30d = expected_daily_new_canonical * 30
where expected_daily_new_canonical is not null;

alter table app.job_sources
  drop constraint job_sources_supply_policy_shape;

alter table app.job_sources
  add constraint job_sources_supply_policy_shape check (
    authority is not null
    and cardinality(allowed_fields) <= 80
    and cardinality(required_dependencies) <= 30
    and cardinality(missing_dependencies) <= 30
    and missing_dependencies <@ required_dependencies
    and raw_retention between interval '0 days' and interval '10 years'
    and (minimum_poll_interval is null or minimum_poll_interval >= interval '15 minutes')
    and (maximum_requests_per_day is null or maximum_requests_per_day between 1 and 10000)
    and (
      expected_new_canonical_per_30d is null
      or expected_new_canonical_per_30d >= 0
    )
    and (
      (expected_new_canonical_per_30d is null and expected_capacity_evidence_ref is null)
      or (
        expected_new_canonical_per_30d is not null
        and char_length(expected_capacity_evidence_ref) between 3 and 500
      )
    )
  );

-- Patch the three readers in place. Each asserts its target expression appears
-- exactly once, so an unexpected body fails the migration closed rather than
-- silently leaving a reader on the dropped column.
do $migration$
declare
  v_function text;
  v_source text;
  v_old text;
  v_new text;
  v_targets constant text[][] := array[
    array[
      'get_job_supply_canary',
      'coalesce(sum(source.expected_daily_new_canonical), 0)::integer',
      'floor(coalesce(sum(source.expected_new_canonical_per_30d), 0) / 30.0)::integer'
    ],
    array[
      'admin_get_job_supply_health',
      'coalesce(sum(source.expected_daily_new_canonical), 0)',
      'floor(coalesce(sum(source.expected_new_canonical_per_30d), 0) / 30.0)::integer'
    ],
    array[
      'worker_dispatch_job_supply',
      'coalesce(sum(expected_daily_new_canonical), 0)::integer',
      'floor(coalesce(sum(expected_new_canonical_per_30d), 0) / 30.0)::integer'
    ]
  ];
  v_row text[];
  v_volatility text;
begin
  foreach v_row slice 1 in array v_targets loop
    v_function := v_row[1];
    v_old := v_row[2];
    v_new := v_row[3];

    select procedure.prosrc,
      case procedure.provolatile when 'v' then 'volatile' else 'stable' end
    into strict v_source, v_volatility
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'api'
      and procedure.proname = v_function
      and procedure.pronargs = 0;

    if (
      char_length(v_source) - char_length(replace(v_source, v_old, ''))
    ) / char_length(v_old) <> 1 then
      raise exception using errcode = '55000',
        message = format('unexpected capacity source in api.%s', v_function);
    end if;

    execute format(
      $definition$
create or replace function api.%s()
returns jsonb
language plpgsql
%s
security definer
set search_path = ''
as $capacity_body$
%s
$capacity_body$;
$definition$,
      v_function,
      v_volatility,
      replace(v_source, v_old, v_new)
    );
  end loop;
end;
$migration$;

alter table app.job_sources
  drop column expected_daily_new_canonical;

-- 50/day: just above the measured ceiling of a fully cycled 108-board roster,
-- so the gate stays a meaningful alarm instead of a permanently red light.
update private.job_supply_targets
set target_daily_new_canonical = 50,
    updated_at = clock_timestamp()
where id;

commit;
