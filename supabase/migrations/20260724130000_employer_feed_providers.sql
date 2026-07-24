-- Admit employer-authorized generic feeds as source-config providers so they
-- persist through the same ingest path as ATS boards (raw snapshots,
-- occurrence links, lifecycle, source-health metrics). The provider allowlist
-- gains the three generic feed kinds alongside greenhouse/lever/ashby/workable.
-- No feed is enabled by this change: an employer-feed config still requires a
-- recorded per-feed authorization in config/employer-feed-registry.json and an
-- enabled source policy before the runtime will run it. The feed runtime
-- (src/lib/jobs/feeds) handles these providers; the ATS fetch path never does.

begin;

alter table private.ats_source_configs
  drop constraint ats_source_configs_provider;
alter table private.ats_source_configs
  add constraint ats_source_configs_provider
  check (provider = any (array[
    'greenhouse'::text, 'lever'::text, 'ashby'::text, 'workable'::text,
    'employer_xml_feed'::text, 'employer_json_feed'::text,
    'employer_csv_import'::text
  ]));

commit;
