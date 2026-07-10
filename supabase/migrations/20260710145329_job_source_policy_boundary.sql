begin;

-- Keep the public source registry limited to reviewed, active publication
-- sources while exposing the stable adapter identifier needed by server-side
-- provider gates. No private reviewer identity or operational state is added
-- to this public projection.
create or replace view api.job_sources
with (security_invoker = true, security_barrier = true)
as
select
  s.id, s.name, s.source_type, s.homepage_url, s.terms_url,
  s.attribution_required, s.attribution_text,
  s.may_index_jobs, s.may_emit_jobposting_schema,
  s.required_destination_kind, s.terms_reviewed_at,
  s.adapter_key, s.may_store_full_description, s.allow_public_listing,
  extract(epoch from s.refresh_interval)::integer as refresh_interval_seconds,
  s.terms_version
from app.job_sources s
where s.status = 'active' and s.allow_public_listing;

comment on column api.job_sources.adapter_key is
  'Stable non-secret adapter identifier for server-side source-policy gates.';

grant select on api.job_sources to anon, authenticated;

-- Workers must resolve the authoritative database policy before contacting a
-- provider. This deliberately returns paused and disabled sources as well as
-- active ones so the caller can fail closed before any network request.
create or replace function api.worker_get_job_source_policy(
  p_adapter_key text
)
returns table (
  source_id uuid,
  adapter_key text,
  source_name text,
  source_type text,
  status text,
  homepage_url text,
  terms_url text,
  attribution_required boolean,
  attribution_text text,
  may_store_full_description boolean,
  may_index_jobs boolean,
  may_emit_jobposting_schema boolean,
  allow_public_listing boolean,
  required_destination_kind text,
  refresh_interval_seconds integer,
  terms_reviewed_at timestamptz,
  terms_reviewed_by uuid,
  terms_version text,
  review_requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform security.require_service_role();
  if p_adapter_key is null
     or char_length(p_adapter_key) not between 1 and 120
     or p_adapter_key !~ '^[a-z0-9_]+$' then
    raise exception using errcode = '22023', message = 'invalid source adapter key';
  end if;

  return query
  select
    s.id,
    s.adapter_key,
    s.name,
    s.source_type::text,
    s.status::text,
    s.homepage_url,
    s.terms_url,
    s.attribution_required,
    s.attribution_text,
    s.may_store_full_description,
    s.may_index_jobs,
    s.may_emit_jobposting_schema,
    s.allow_public_listing,
    s.required_destination_kind,
    extract(epoch from s.refresh_interval)::integer,
    s.terms_reviewed_at,
    s.terms_reviewed_by,
    s.terms_version,
    s.review_requested_at
  from app.job_sources s
  where s.adapter_key = p_adapter_key;
end;
$$;

comment on function api.worker_get_job_source_policy(text) is
  'Service-role-only source policy used to stop disabled, paused, unreviewed, or unsupported providers before acquisition.';

revoke all on function api.worker_get_job_source_policy(text)
from public, anon, authenticated;
grant execute on function api.worker_get_job_source_policy(text)
to service_role;

-- The original guard incorrectly treated public listing and search indexing as
-- the same permission, and its import retry branch created queued rows for
-- which no executor exists. Pin the exact reviewed function body before making
-- those two narrow changes; abort rather than preserving unrelated drift.
do $migration$
declare
  v_source text;
  v_expected_hash constant text :=
    'dcc6633aa702f01931246aef7d377e2d34765f928e821548b5fe175483b4f5da';
  v_old_guard constant text :=
    'and (not s.allow_public_listing or s.may_index_jobs)';
  v_new_guard constant text :=
    'and (not s.allow_public_listing or not s.may_emit_jobposting_schema or s.may_index_jobs)';
  v_old_retry constant text := $old_retry$if action_name = 'retry' then
        if v_before not in ('failed', 'partially_succeeded', 'cancelled') then
          raise exception using errcode = '23514', message = 'only failed, partial, or cancelled imports can be retried';
        end if;
        insert into ingest.import_runs (source_id, status, triggered_by, retry_of)
        select source_id, 'queued', 'admin_retry', id
        from ingest.import_runs where id = target_id
        returning id into v_related_id;
        update ingest.import_runs set admin_version = admin_version where id = target_id;
        v_after := 'retry_queued';
      elsif action_name = 'cancel' then
$old_retry$;
  v_new_retry constant text := $new_retry$if action_name = 'retry' then
        raise exception using errcode = '0A000',
          message = 'import retry is unavailable; scheduled source adapters own refresh execution';
      elsif action_name = 'cancel' then
$new_retry$;
begin
  select replace(p.prosrc, E'\r\n', E'\n') into strict v_source
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'security'
    and p.proname = 'admin_transition'
    and p.proargtypes = '25 25 2950 25 23'::oidvector;

  if encode(
       extensions.digest(convert_to(v_source, 'UTF8'), 'sha256'),
       'hex'
     ) <> v_expected_hash
     or position('#variable_conflict use_variable' in v_source) = 0
     or position(v_old_guard in v_source) = 0
     or position(v_new_guard in v_source) > 0
     or position(v_old_retry in v_source) = 0
     or position(v_new_retry in v_source) > 0
     or position('$source_policy_admin_body$' in v_source) > 0 then
    raise exception using errcode = '55000',
      message = 'unexpected admin transition preimage';
  end if;

  if (
    char_length(v_source) - char_length(replace(v_source, v_old_guard, ''))
  ) / char_length(v_old_guard) <> 1 then
    raise exception using errcode = '55000',
      message = 'ambiguous admin transition source policy guard';
  end if;
  if (
    char_length(v_source) - char_length(replace(v_source, v_old_retry, ''))
  ) / char_length(v_old_retry) <> 1 then
    raise exception using errcode = '55000',
      message = 'ambiguous admin transition import retry branch';
  end if;

  v_source := replace(v_source, v_old_guard, v_new_guard);
  v_source := replace(v_source, v_old_retry, v_new_retry);
  v_source := replace(
    v_source,
    'source terms and indexing permissions must be reviewed',
    'source terms and publication permissions must be reviewed'
  );

  execute format(
    $definition$
create or replace function security.admin_transition(
  resource_name text,
  action_name text,
  target_id uuid,
  action_reason text,
  expected_version integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $source_policy_admin_body$
%s
$source_policy_admin_body$;
$definition$,
    v_source
  );
end;
$migration$;

-- The exposed wrapper is the sole authenticated entry point. Make it a
-- definer boundary, keep the role/AAL checks in the reviewed security routine,
-- and remove the unnecessary direct grant on that internal routine.
create or replace function api.admin_transition(
  resource_name text,
  action_name text,
  target_id uuid,
  action_reason text,
  expected_version integer
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select security.admin_transition($1, $2, $3, $4, $5)
$$;

revoke all on function security.admin_transition(text,text,uuid,text,integer)
from public, anon, authenticated;
revoke all on function api.admin_transition(text,text,uuid,text,integer)
from public, anon;
grant execute on function api.admin_transition(text,text,uuid,text,integer)
to authenticated;

commit;
