-- Record observed 30-day canonical output for every active ATS source.
--
-- APPLIED TO PRODUCTION 2026-08-03. 60 sources updated; the health canary's
-- authorized_daily_capacity moved from 0 to 35.
--
-- Why: all 60 active ATS sources had expected_new_canonical_per_30d NULL, so
-- api.get_job_supply_canary computed an authorised capacity of zero and the
-- platform reported "capacity_unproven" indefinitely. The pipeline was in
-- fact producing 1,072 canonical rows in the trailing 30 days; nobody had
-- written the number down.
--
-- This is a measurement, not an estimate. It counts rows app.jobs actually
-- gained per source. Sources that produced nothing are recorded as 0 rather
-- than given a hopeful figure.
--
-- Honest caveats, both carried in the evidence reference itself:
--   * Ingestion began 2026-07-21, so the 30-day window is partial and
--     understates a steady-state month.
--   * job_supply_ready remains FALSE, correctly: 35/day is below the 50/day
--     target. The change moves the platform from "we do not know" to "we know,
--     and it is short" — which is the useful state to be in.
--
-- Note on the state label: api.get_job_supply_canary emits
-- 'capacity_unproven' whenever capacity < target, so the label is imprecise
-- now that capacity IS proven and merely short. It was left alone
-- deliberately — the value is pinned by a zod enum in src/app/api/health and
-- by tests, so renaming it is an RPC contract change that must ship with its
-- read path, and this is a naming nit rather than a wrong number.
--
-- Re-run this after a full month of ingestion to replace the partial window.

with observed as (
  select s.id as source_id,
         count(j.id) filter (
           where j.created_at > now() - interval '30 days'
         ) as created_30d
  from app.job_sources s
  join private.ats_source_configs c on c.source_id = s.id
  left join app.jobs j on j.source_id = s.id
  where s.status = 'active'
  group by s.id
)
update app.job_sources s
set expected_new_canonical_per_30d = o.created_30d,
    expected_capacity_evidence_ref =
      'Observed canonical rows created in the 30 days to 2026-08-02, measured directly from app.jobs. Ingestion began 2026-07-21, so this window is partial and understates a steady-state month.'
from observed o
where o.source_id = s.id;
