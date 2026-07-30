-- Admit SmartRecruiters as an ATS provider.
--
-- Chosen on licence rather than yield, which is the opposite of how the other
-- four were picked. A sweep of 93 African employers' own careers pages found the
-- Nigerian supply sitting on providers this product may not ingest:
--
--   Oracle Cloud HCM   MTN Nigeria (19 roles, almost all Ikoyi/Lagos, refreshed
--                      daily), Ecobank, Norwegian Refugee Council, Save the
--                      Children -- but Oracle's own REST documentation states
--                      the recruitingCEJobRequisitions endpoints "are only for
--                      Oracle internal use". The licence is confirmed, and
--                      confirmed as not permitting this.
--   Workday            PZ Cussons (Abuja, Lokoja, Ilupeju), FHI 360 -- the
--                      /wday/cxs/ endpoints carry no public documentation at
--                      all, so the basis cannot be evidenced.
--   SeamlessHR         PiggyVest and other Nigerian tenants -- no public
--                      listing API and no documentation.
--
-- SmartRecruiters is the only remaining provider that publishes a documented
-- public Posting API with no authentication, so it is the only one whose
-- authorization_basis 'documented_public_api' can be honestly claimed.
--
-- It also has, today, no African supply: 224 probed tenant slugs returned three
-- live boards (Visa 2 roles, IHS Towers 1, Yassir 6 whose newest posting is
-- from 2022) and zero Nigerian or African roles. That is a deliberate trade.
-- Registering a *board* that reaches nobody costs worker claims, storage and
-- provider requests, which is why 43 were paused last week. Admitting a
-- *provider* costs nothing until a board is registered against it, so the
-- capability can wait, correctly licensed, for the first employer to adopt it.
--
-- No source rows here. Registrations are data and live in docs/data/.

begin;

alter table private.ats_source_configs
  drop constraint ats_source_configs_provider;
alter table private.ats_source_configs
  add constraint ats_source_configs_provider
  check (provider = any (array[
    'greenhouse'::text, 'lever'::text, 'ashby'::text, 'workable'::text,
    'smartrecruiters'::text
  ]));

commit;
