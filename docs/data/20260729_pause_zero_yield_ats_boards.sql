-- Pause the ATS boards that reach nobody, 2026-07-29.
--
-- Applied directly to production; not part of the migration chain, because it
-- changes source registrations rather than schema.
--
-- WHY
--
-- Once the registry walk finished, the numbers were unambiguous. Of 108 active
-- sources, four had ever produced a Nigerian job:
--
--   moniepoint_greenhouse   65 published   65 Nigerian   53 visible
--   zipline_greenhouse      15 published    6 Nigerian    7 visible
--   kuda_workable           11 published   11 Nigerian   11 visible
--   fairmoney_workable       9 published    9 Nigerian    5 visible
--
-- canonical_greenhouse publishes 135 with no Nigerian location at all, and all
-- 135 are visible: they reach candidates through the remote-eligibility lane
-- rather than the country lane. It is kept, and the rule below is written so it
-- cannot be caught by it.
--
-- Against that, 43 boards published 770 rows between them and put *nothing* in
-- front of a candidate: no Nigerian location, nothing past the public gate.
-- 20260726_register_workable_boards.sql had registered a wide sweep of Workable
-- tenants, and most turned out to be Egyptian, Gulf or global-outsourcing
-- employers. They cost storage, worker claims and provider requests, and they
-- generated the quarantine noise that was failing ats_source_sync runs.
--
-- ajaia_workable is included explicitly. It offered 245 roles and stored zero,
-- which is what put ats_source_sync into a failed state. Its board is 83 United
-- States, 36 Philippines, 36 India, 28 Pakistan, 15 Kenya and no Nigerian roles
-- whatsoever, so fixing its parsing would have imported 245 records that the
-- country gate then withholds. Pausing is the fix; the adapter is not at fault.
--
-- jumia_greenhouse was caught by the rule and deliberately restored. It yields
-- nothing today, but Jumia hires in Nigeria and the board was a considered
-- registration (20260724_register_jumia_greenhouse.sql). A board that may carry
-- Nigerian roles later is not the same as one that never will.
--
-- REVERSIBLE. `status = 'paused'` stops the worker claiming a source; it does
-- not delete the registration, its policy review, or its country rights. Set
-- status back to 'active' to resume one.
--
-- Result: 108 active -> 65 active, 46 paused. Visible jobs unchanged at 211,
-- Nigerian jobs unchanged at 91, which is the point: nothing a candidate could
-- see was removed.

with noise as (
  select s.id
  from app.job_sources s
  left join app.jobs j on j.source_id = s.id
  where s.status = 'active'
  group by s.id
  having count(j.id) filter (where j.status = 'published') > 0
     and count(j.id) filter (
           where j.status = 'published'
             and exists (
               select 1 from app.job_locations l
               where l.job_id = j.id and l.country_code = 'NG'
             )
         ) = 0
     and count(j.id) filter (
           where j.status = 'published' and j.public_provenance is not null
         ) = 0
),
targets as (
  select id from noise
  union
  select id from app.job_sources
  where adapter_key = 'ajaia_workable' and status = 'active'
)
update app.job_sources s
set status = 'paused', updated_at = now()
from targets t
where s.id = t.id;

-- Restored: hires in Nigeria, registered deliberately, simply has no open
-- Nigerian role at this moment.
update app.job_sources
set status = 'active', updated_at = now()
where adapter_key = 'jumia_greenhouse';
