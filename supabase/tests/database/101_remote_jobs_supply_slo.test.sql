begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, ingest, security, audit;
select plan(9);

select ok(
  to_regprocedure('security.is_african_country_code(text)') is not null,
  'African country predicate exists'
);
select ok(
  to_regprocedure('security.job_is_public_remote_eligible(uuid)') is not null,
  'remote publication predicate exists'
);
select ok(
  to_regprocedure('api.get_job_supply_canary()') is not null,
  'public supply canary exists'
);
select ok(
  security.is_african_country_code('NG')
  and security.is_african_country_code('ZA')
  and security.is_african_country_code('KE'),
  'African market country codes are recognized'
);
select ok(
  not security.is_african_country_code('US')
  and not security.is_african_country_code('GB')
  and not security.is_african_country_code(null),
  'non-African and missing country codes are rejected'
);
select is(
  (select target_daily_new_canonical from private.job_supply_targets where id),
  500,
  'daily supply SLO is five hundred distinct canonical jobs'
);
select ok(
  has_function_privilege('anon', 'api.get_job_supply_canary()', 'EXECUTE')
  and has_function_privilege(
    'authenticated',
    'api.get_job_supply_canary()',
    'EXECUTE'
  ),
  'public health callers can read the count-only supply canary'
);
select ok(
  not has_function_privilege(
    'anon',
    'security.is_african_country_code(text)',
    'EXECUTE'
  ),
  'the internal country helper is not directly exposed'
);
select ok(
  has_function_privilege(
    'anon',
    'security.job_is_public_remote_eligible(uuid)',
    'EXECUTE'
  ),
  'the RLS publication predicate is executable by public reads'
);

select * from finish();
rollback;
