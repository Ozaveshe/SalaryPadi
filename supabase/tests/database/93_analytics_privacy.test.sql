begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, ingest, security, audit;
select plan(15);

select ok(
  to_regclass('private.anonymous_rate_limit_windows') is not null,
  'anonymous fixed-window counters exist in the private schema'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class
   where oid = 'private.anonymous_rate_limit_windows'::regclass),
  'anonymous rate-limit counters enforce RLS'
);
select ok(
  to_regprocedure('api.capture_analytics_event(text,text)') is null
  and to_regprocedure('security.capture_analytics_event_internal(text,text)') is null,
  'the direct anonymous analytics signatures are removed'
);
select ok(
  not has_function_privilege(
    'anon',
    'api.capture_analytics_event(text,text,text,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'api.capture_analytics_event(text,text,text,timestamptz)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'api.capture_analytics_event(text,text,text,timestamptz)',
    'EXECUTE'
  ),
  'only the service role can call the analytics capture wrapper'
);
select ok(
  not has_function_privilege(
    'anon',
    'security.capture_analytics_event_internal(text,text,text,timestamptz)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'security.capture_analytics_event_internal(text,text,text,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'security.consume_anonymous_rate_limit(text,text,timestamptz,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'security.consume_anonymous_rate_limit(text,text,timestamptz,integer)',
    'EXECUTE'
  ),
  'the privileged implementation and limiter have narrow grants'
);
select ok(
  not has_table_privilege(
    'anon',
    'private.anonymous_rate_limit_windows',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'private.anonymous_rate_limit_windows',
    'SELECT'
  )
  and not has_table_privilege(
    'service_role',
    'private.anonymous_rate_limit_windows',
    'INSERT'
  ),
  'rate-limit rows are reachable only through the security definer'
);
select is(
  (select prosecdef
   from pg_proc
   where oid = 'api.capture_analytics_event(text,text,text,timestamptz)'::regprocedure),
  false,
  'the exposed analytics wrapper is security invoker'
);
select is(
  (select prosecdef
   from pg_proc
   where oid = 'security.capture_analytics_event_internal(text,text,text,timestamptz)'::regprocedure),
  true,
  'the private analytics implementation is security definer'
);

set local role anon;
select throws_ok(
  $$ select api.capture_analytics_event(
       'page_view',
       '/jobs',
       repeat('a', 64),
       date_bin(
         interval '5 minutes',
         clock_timestamp(),
         timestamptz '1970-01-01 00:00:00+00'
       )
     ) $$,
  '42501',
  null,
  'anonymous callers cannot bypass the consent-checking route'
);
reset role;

select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'service_role')::text,
  true
);
set local role service_role;

select throws_ok(
  $$ select api.capture_analytics_event(
       'salary_amount',
       '/jobs',
       repeat('a', 64),
       date_bin(
         interval '5 minutes',
         clock_timestamp(),
         timestamptz '1970-01-01 00:00:00+00'
       )
     ) $$,
  '22023',
  null,
  'non-allowlisted analytics events fail closed'
);
select throws_ok(
  $$ select api.capture_analytics_event(
       'page_view',
       '/private-value',
       repeat('a', 64),
       date_bin(
         interval '5 minutes',
         clock_timestamp(),
         timestamptz '1970-01-01 00:00:00+00'
       )
     ) $$,
  '22023',
  null,
  'non-allowlisted route groups fail closed'
);
select throws_ok(
  $$ select api.capture_analytics_event(
       'page_view',
       '/jobs',
       repeat('a', 64),
       date_bin(
         interval '5 minutes',
         clock_timestamp() - interval '1 hour',
         timestamptz '1970-01-01 00:00:00+00'
       )
     ) $$,
  '22023',
  null,
  'stale client windows cannot evade the fixed-window limit'
);
select throws_ok(
  $$ select api.capture_analytics_event(
       'page_view',
       '/jobs',
       '203.0.113.42',
       date_bin(
         interval '5 minutes',
         clock_timestamp(),
         timestamptz '1970-01-01 00:00:00+00'
       )
     ) $$,
  '22023',
  null,
  'raw network addresses are rejected at the database boundary'
);

do $$
begin
  for i in 1..120 loop
    perform api.capture_analytics_event(
      'page_view',
      '/jobs',
      repeat('a', 64),
      date_bin(
        interval '5 minutes',
        clock_timestamp(),
        timestamptz '1970-01-01 00:00:00+00'
      )
    );
  end loop;
end;
$$;

select throws_ok(
  $$ select api.capture_analytics_event(
       'page_view',
       '/jobs',
       repeat('a', 64),
       date_bin(
         interval '5 minutes',
         clock_timestamp(),
         timestamptz '1970-01-01 00:00:00+00'
       )
     ) $$,
  'P0001',
  'rate limit exceeded',
  'the 121st event in one network window is rejected'
);
reset role;

select is(
  (select event_count
   from private.anonymous_rate_limit_windows
   where scope = 'analytics_event'
     and network_key_hash = repeat('a', 64)
   order by window_started_at desc
   limit 1),
  120,
  'the fixed-window counter saturates at the configured threshold'
);

select * from finish();
rollback;
