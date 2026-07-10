begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, ingest, security, audit;
select plan(29);

select ok(
  to_regclass('private.worker_runs') is not null
  and to_regclass('private.worker_schedules') is not null
  and to_regclass('private.alert_deliveries') is not null
  and to_regclass('private.analytics_daily_counts') is not null,
  'phase-two internal operational tables exist'
);

select ok(
  to_regclass('api.current_currency_rates') is not null,
  'current currency-rate projection exists'
);

select is(
  (select count(*)::integer from app.job_sources where adapter_key = 'remotive'),
  1,
  'the reviewed Remotive source has one policy record'
);
select is(
  (select may_store_full_description from app.job_sources where adapter_key = 'remotive'),
  false,
  'Remotive policy prohibits durable full-description storage'
);
select is(
  (select may_index_jobs from app.job_sources where adapter_key = 'remotive'),
  false,
  'Remotive policy prohibits indexing'
);
select is(
  (select may_emit_jobposting_schema from app.job_sources where adapter_key = 'remotive'),
  false,
  'Remotive policy prohibits JobPosting structured data'
);

select ok(
  not has_function_privilege('anon', 'api.worker_start(text,text,timestamptz,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'api.worker_start(text,text,timestamptz,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'api.worker_start(text,text,timestamptz,text)', 'EXECUTE'),
  'only service role can start operational workers'
);
select ok(
  not has_function_privilege('anon', 'api.worker_claim_alert_deliveries(integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'api.worker_claim_alert_deliveries(integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'api.worker_claim_alert_deliveries(integer)', 'EXECUTE'),
  'only service role can claim recipient email addresses'
);
select ok(
  has_function_privilege('anon', 'api.capture_analytics_event(text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'api.capture_analytics_event(text,text)', 'EXECUTE'),
  'public application roles can submit only the constrained aggregate event RPC'
);
select ok(
  has_function_privilege('anon', 'api.get_worker_health()', 'EXECUTE')
  and has_table_privilege('anon', 'api.current_currency_rates', 'SELECT'),
  'safe operational health and currency provenance are publicly readable'
);

set local role anon;
select throws_ok(
  $$ select * from api.worker_start('currency_rates', 'forbidden', null, null) $$,
  '42501', null,
  'anonymous callers cannot execute worker start even through a direct grant regression'
);
select lives_ok(
  $$ select api.capture_analytics_event('page_view', '/jobs') $$,
  'allowlisted anonymous aggregate event is accepted'
);
select throws_ok(
  $$ select api.capture_analytics_event('salary_amount', '/jobs') $$,
  '22023', null,
  'analytics event denylist fails closed in the database'
);

reset role;
select is(
  (select event_count::integer from private.analytics_daily_counts
   where occurred_on = current_date and event_name = 'page_view' and route_group = '/jobs'),
  1,
  'analytics stores only the aggregate daily counter'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'service_role')::text,
  true
);
set local role service_role;

create temporary table phase_two_worker_start as
select * from api.worker_start(
  'currency_rates', 'test:2026-07', timestamptz '2026-07-10 02:25:00+00', 'deploy-test'
);
select is((select should_run from phase_two_worker_start), true, 'first run key is claimed');
select is(
  (select should_run from api.worker_start(
    'currency_rates', 'test:2026-07', timestamptz '2026-07-10 02:25:00+00', 'deploy-test'
  )),
  false,
  'replayed worker run key is idempotently skipped'
);
select is(
  api.worker_finish(
    (select run_id from phase_two_worker_start), 'succeeded',
    '{"rate_count":42}'::jsonb, null
  ),
  true,
  'claimed worker run can be completed once'
);
select is(
  api.worker_finish(
    (select run_id from phase_two_worker_start), 'succeeded', '{}'::jsonb, null
  ),
  false,
  'completed worker run cannot be rewritten through the result RPC'
);

select ok(
  api.worker_store_inforeuro_rates(
    timestamptz '2026-07-01 00:00:00+00',
    'https://ec.europa.eu/budg/inforeuro/api/public/monthly-rates?year=2026&month=7',
    '[{"base_currency":"USD","quote_currency":"NGN","rate":1369.4546730},{"base_currency":"NGN","quote_currency":"USD","rate":0.000730217}]'::jsonb
  ) is not null,
  'service worker stores a reviewed InforEuro rate set'
);
reset role;
select is(
  (select count(*)::integer from app.currency_rate_sets
   where provider_key = 'european_commission_inforeuro' and data_period = date '2026-07-01'),
  1,
  'provider and month are unique'
);
select is(
  (select count(*)::integer from api.current_currency_rates),
  2,
  'current rate projection exposes the complete stored cross-rate set'
);
select ok(
  (select attribution_text like 'European Commission%'
   from api.current_currency_rates limit 1),
  'currency projection carries required provider attribution'
);

reset role;
insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'ad000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
  'alert-owner@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()
) on conflict (id) do nothing;
insert into private.job_alerts (id, user_id, name, search_spec, cadence)
values (
  'ae000000-0000-0000-0000-000000000001',
  'ad000000-0000-0000-0000-000000000001', 'Nigeria writer',
  '{"schema_version":1,"q":"writer","eligibility":"nigeria"}'::jsonb,
  'daily'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'service_role')::text,
  true
);
set local role service_role;
create temporary table phase_two_alert_claim as
select * from api.worker_claim_alert_deliveries(10);
select is((select count(*)::integer from phase_two_alert_claim), 1, 'due alert is claimed once');
select is(
  (select recipient_email from phase_two_alert_claim),
  'alert-owner@example.test',
  'recipient address is returned only inside the service-role claim'
);
select is(
  api.worker_complete_alert_delivery(
    (select delivery_id from phase_two_alert_claim),
    (select claim_token from phase_two_alert_claim),
    'skipped', 0, null, null
  ),
  true,
  'no-match delivery is completed without sending email'
);
reset role;
select ok(
  (select last_sent_at is not null from private.job_alerts
   where id = 'ae000000-0000-0000-0000-000000000001'),
  'completed no-match period advances the alert cadence'
);
set local role service_role;
select is(
  (select count(*)::integer from api.worker_claim_alert_deliveries(10)),
  0,
  'same alert period cannot be claimed twice'
);

reset role;
set local role anon;
select is(
  (select freshness from api.get_worker_health() where task_key = 'currency_rates'),
  'healthy',
  'public worker health reports current successful evidence'
);
reset role;
select ok(
  not has_table_privilege('anon', 'private.analytics_daily_counts', 'SELECT')
  and not has_table_privilege('anon', 'private.alert_deliveries', 'SELECT'),
  'raw analytics and delivery records remain private'
);

select * from finish();
rollback;
