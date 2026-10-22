begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, security;
select plan(10);
update private.job_alerts set is_enabled=false;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('ad000000-0000-4000-8000-000000000119','authenticated','authenticated','alert-test@example.test',now(),'{}','{}',now(),now());
insert into private.job_alerts(id,user_id,name,search_spec,cadence)
values ('ae000000-0000-4000-8000-000000000119','ad000000-0000-4000-8000-000000000119','Kenya','{"schema_version":1,"applicantCountry":"KE"}','daily');
select ok(not has_table_privilege('authenticated','private.alert_sent_jobs','SELECT'),'delivery history is private');
select ok(not has_function_privilege('authenticated','api.worker_read_alert_state(uuid,uuid)','EXECUTE'),'recipient history is service-only');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
create temporary table alert_claim as select * from api.worker_claim_alert_deliveries(1);
select is((select count(*)::integer from alert_claim),1,'confirmed active account is claimed');
select is((select api.worker_read_alert_state(delivery_id,claim_token)->'sent_job_keys' from alert_claim),'[]'::jsonb,'new alert has no sent roles');
select lives_ok($q$select api.worker_prepare_alert(delivery_id,claim_token,'{"job_keys":["job-one"],"email":{"subject":"Match","text":"Match","html":"Match"}}') from alert_claim$q$,'message is prepared before sending');
select is((select api.worker_prepare_alert(delivery_id,claim_token,'{"job_keys":["job-two"],"email":{"subject":"Changed","text":"Changed","html":"Changed"}}')->'job_keys' from alert_claim),'["job-one"]'::jsonb,'retry preserves original email and role keys');
select is((select api.worker_complete_alert_with_jobs(delivery_id,claim_token,'sent',1,'provider-test',null) from alert_claim),true,'provider acceptance completes atomically');
reset role;
select is((select count(*)::integer from private.alert_sent_jobs where alert_id='ae000000-0000-4000-8000-000000000119'),1,'successful role is remembered');
-- Pending retries must respect unsubscribe, even if already queued.
update private.alert_deliveries set status='failed',attempt_count=1,next_attempt_at=now() where alert_id='ae000000-0000-4000-8000-000000000119';
update private.job_alerts set is_enabled=false where id='ae000000-0000-4000-8000-000000000119';
set local role service_role;
select is((select count(*)::integer from api.worker_claim_alert_deliveries(1)),0,'paused alerts cannot reclaim queued retries');
reset role;
update private.job_alerts set is_enabled=true where id='ae000000-0000-4000-8000-000000000119';
update auth.users set email_confirmed_at=null where id='ad000000-0000-4000-8000-000000000119';
set local role service_role;
select is((select count(*)::integer from api.worker_claim_alert_deliveries(1)),0,'unconfirmed inboxes cannot claim deliveries');
reset role;
select * from finish();
rollback;
