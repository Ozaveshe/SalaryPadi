-- Admit Workable as an ATS provider. Nigerian employers overwhelmingly run
-- their careers pages on Workable's public widget API (verified: Kuda and
-- FairMoney publish 26 fresh Nigeria roles between them), so the provider
-- allowlist gains 'workable' alongside greenhouse/lever/ashby. The worker
-- adapter ships in the same change; sources register separately.

begin;

alter table private.ats_source_configs
  drop constraint ats_source_configs_provider;
alter table private.ats_source_configs
  add constraint ats_source_configs_provider
  check (provider = any (array[
    'greenhouse'::text, 'lever'::text, 'ashby'::text, 'workable'::text
  ]));

commit;
