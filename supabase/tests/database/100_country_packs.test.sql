begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, ingest, security;
select plan(39);

select has_table('app', 'currencies', 'currency catalog exists');
select has_table('app', 'country_locales', 'country locales exist');
select has_table('app', 'country_time_zones', 'country time zones exist');
select has_table('app', 'subdivisions', 'normalized subdivisions exist');
select has_table('app', 'cities', 'normalized cities exist');
select has_table('app', 'job_timezone_requirements', 'timezone overlap evidence exists');
select has_table('app', 'country_statutory_rule_versions', 'versioned statutory rules exist');
select has_table('app', 'country_facts', 'cited country facts exist');
select has_table('app', 'source_country_rights', 'country-scoped source rights exist');
select has_table('private', 'country_pack_gate_reviews', 'qualitative gate evidence exists');

select has_column('app', 'market_countries', 'public_routes_enabled', 'market activation is explicit');
select has_column('app', 'job_locations', 'source_location_text', 'physical location preserves source evidence');
select has_column('app', 'company_locations', 'city_id', 'company offices support normalized cities');
select has_column('private', 'company_reviews', 'office_id', 'reviews carry a private normalized office');

select is(
  (select count(*)::integer from app.market_countries where iso2 in ('NG', 'GH', 'KE', 'ZA')),
  4,
  'four country packs are configured'
);
select is(
  (select array_agg(iso2 order by iso2) from app.market_countries where public_routes_enabled),
  array['NG']::text[],
  'Nigeria is the only public country pack'
);
select is(
  (select count(*)::integer from app.market_countries
   where iso2 in ('GH', 'KE', 'ZA') and not search_index_enabled and pack_state = 'candidate'),
  3,
  'candidate packs are neither active nor indexable'
);
select is(
  (select count(*)::integer from app.country_locales
   where country_code in ('NG', 'GH', 'KE', 'ZA') and is_default),
  4,
  'each test target has a default locale configuration'
);

select ok(to_regprocedure('security.job_explicitly_allows_country(uuid,text)') is not null,
  'country eligibility predicate exists');
select ok(to_regprocedure('security.job_source_country_policy_is_runnable(uuid,text)') is not null,
  'country source-rights predicate exists');
select ok(to_regprocedure('security.country_pack_readiness_metrics(text)') is not null,
  'readiness metrics function exists');
select ok(to_regprocedure('api.admin_get_country_pack_readiness()') is not null,
  'protected country dashboard RPC exists');
select ok(to_regprocedure('api.worker_get_source_country_rights(uuid)') is not null,
  'worker country-rights boundary exists');
select ok(to_regprocedure('security.job_country_distribution_allowed(uuid,text)') is not null,
  'country-scoped public and search distribution predicate exists');

select ok(
  not has_function_privilege('anon', 'api.admin_get_country_pack_readiness()', 'EXECUTE')
  and has_function_privilege('authenticated', 'api.admin_get_country_pack_readiness()', 'EXECUTE'),
  'only authenticated staff can reach the dashboard authorization check'
);
select ok(
  not has_function_privilege('anon', 'api.worker_get_source_country_rights(uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'api.worker_get_source_country_rights(uuid)', 'EXECUTE'),
  'only service workers can resolve source country rights'
);
select ok(
  (select bool_and(c.relrowsecurity and c.relforcerowsecurity)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where (n.nspname, c.relname) in (
     ('app', 'source_country_rights'),
     ('app', 'country_statutory_rule_versions'),
     ('private', 'country_pack_gate_reviews')
   )),
  'rights, rules, and gate evidence force row-level security'
);

insert into app.companies (
  id, slug, display_name, record_status
) values (
  'a0000000-0000-4000-8000-000000000001',
  'country-pack-test-employer', 'Country pack test employer', 'draft'
);
insert into app.jobs (
  id, company_id, source_id, external_source_id, slug, status,
  title, description_text, work_arrangement, employment_type,
  application_url, source_url
) values (
  'a0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000001',
  (select id from app.job_sources where adapter_key = 'salarypadi_employer_submissions'),
  'country-pack-emea-test', 'country-pack-emea-test', 'draft',
  'EMEA test role', 'This test-only role checks exact country eligibility evidence.',
  'remote', 'full_time', 'https://employer.example.test/jobs/emea',
  'https://employer.example.test/jobs/emea'
);
insert into app.job_eligibility (
  job_id, scope, evidence_text, provenance, last_verified_at
) values (
  'a0000000-0000-4000-8000-000000000002', 'emea',
  'EMEA wording only', 'source_provided', clock_timestamp()
);

select is(
  security.job_explicitly_allows_country(
    'a0000000-0000-4000-8000-000000000002', 'GH'
  ),
  false,
  'EMEA never automatically includes Ghana or all African countries'
);

insert into app.job_eligibility_countries (job_id, country_code, rule) values (
  'a0000000-0000-4000-8000-000000000002', 'ZA', 'include'
);
select is(
  security.job_explicitly_allows_country(
    'a0000000-0000-4000-8000-000000000002', 'ZA'
  ),
  true,
  'an exact included-country occurrence can authorize South Africa'
);

select throws_ok(
  $$ update app.market_countries set public_routes_enabled = true where iso2 = 'GH' $$,
  '23514', 'candidate or suspended country packs cannot be public',
  'a candidate cannot be made public by flipping one flag'
);

select is(
  security.job_source_country_policy_is_runnable(
    (select id from app.job_sources where adapter_key = 'salarypadi_employer_submissions'),
    'GH'
  ),
  false,
  'missing Ghana rights fail closed even for a globally reviewed source'
);

select ok(
  pg_get_functiondef('security.enforce_fetch_country_rights()'::regprocedure)
    ~ 'job_source_country_policy_is_runnable',
  'provider fetch claims require runnable active-country rights before network access'
);
select ok(
  (select pg_get_expr(policy.polqual, policy.polrelid) ~ 'job_country_distribution_allowed'
   from pg_policy policy
   join pg_class relation on relation.oid = policy.polrelid
   join pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'app' and relation.relname = 'jobs'
     and policy.polname = 'jobs_public_read'),
  'public job RLS requires country display rights'
);
select ok(
  pg_get_functiondef('security.google_indexing_job_is_eligible(uuid)'::regprocedure)
    ~ 'job_country_distribution_allowed',
  'Google job notifications require country-specific indexing rights'
);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'app' and table_name = 'job_salary_evidence'
      and column_name in ('original_currency', 'original_period', 'gross_net', 'source_text')
    group by table_schema, table_name having count(*) = 4
  ),
  'original salary currency, period, gross or net status, and text remain preserved'
);

select is(
  (select count(*)::integer from app.country_facts where country_code in ('GH', 'KE', 'ZA')),
  0,
  'candidate country facts are not fabricated in production data'
);
select is(
  (select count(*)::integer from app.country_statutory_rule_versions
   where country_code in ('GH', 'KE', 'ZA')),
  0,
  'candidate statutory rules remain empty until reviewed evidence exists'
);
select is(
  (select count(*)::integer from app.subdivisions where country_code in ('NG', 'GH', 'KE', 'ZA')),
  0,
  'subdivision examples stay in test fixtures rather than production rows'
);
select is(
  (select count(*)::integer from app.cities where country_code in ('NG', 'GH', 'KE', 'ZA')),
  0,
  'city examples stay in test fixtures rather than production rows'
);

select * from finish();
rollback;
