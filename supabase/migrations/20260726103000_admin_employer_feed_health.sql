-- Operator visibility for employer feeds.
--
-- 20260725140000 persists feed run metrics and source evidence; nothing
-- rendered them, so an operator could not see why a feed was or was not
-- running. This exposes an admin-only view.
--
-- It deliberately lists EVERY feed-shaped source config, not only the
-- authorized ones, and states why an unauthorized one is not running. A feed
-- that silently fails to appear is the failure mode this surface exists to
-- prevent.

begin;

create or replace function api.admin_get_employer_feed_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select security.has_staff_role('admin'))
     or not (select security.is_aal2()) then
    raise exception using errcode = '42501',
      message = 'admin role and AAL2 required';
  end if;

  return jsonb_build_object(
    'generated_at', clock_timestamp(),
    'feeds', coalesce((
      select jsonb_agg(feed order by feed ->> 'adapter_key')
      from (
        select jsonb_build_object(
          'adapter_key', s.adapter_key,
          'source_name', s.name,
          'employer_name', c.display_name,
          'feed_kind', cfg.provider,
          'config_enabled', cfg.enabled,
          'publication_mode', cfg.publication_mode,
          -- Why this feed is or is not runnable, in one field.
          'authorization_state', case
            when exists (
              select 1 from security.authorized_feed_source_config_rows() a
              where a.adapter_key = s.adapter_key
            ) then 'authorized'
            when not cfg.enabled then 'config_disabled'
            when s.status <> 'active' then 'source_' || s.status
            when s.authorization_revoked_at is not null then 'revoked'
            when s.authorization_expires_at is not null
              and s.authorization_expires_at <= clock_timestamp()
              then 'expired'
            when s.authorization_basis is null
              or s.authorization_evidence_ref is null
              or s.authorization_grantor is null
              then 'authorization_incomplete'
            when s.authorization_basis not in (
              'written_permission', 'commercial_contract'
            ) then 'authorization_basis_not_permitted'
            when cfg.fetch_interval <> s.refresh_interval
              then 'interval_mismatch'
            when c.record_status = 'removed'
              or c.verification_status = 'suspended'
              then 'company_not_publishable'
            else 'not_authorized'
          end,
          'next_rights_review', s.authorization_reviewed_at,
          'authorization_expires_at', s.authorization_expires_at,
          'current_job_count', (
            select count(*) from app.jobs job
            where job.source_id = s.id and job.status = 'open'
          ),
          'last_attempt_at', latest.run_at,
          'last_outcome', latest.outcome,
          'last_error_code', latest.error_code,
          'last_snapshot_complete', latest.snapshot_complete,
          'last_complete_snapshot_at', complete_run.run_at,
          'fetched', latest.fetched_count,
          'accepted', latest.accepted_count,
          'filtered', latest.filtered_count,
          'quarantined', latest.quarantined_count,
          'destination_dropped', latest.destination_dropped_count,
          'invalid_records', latest.invalid_record_count,
          'inserted', latest.inserted_count,
          'updated', latest.updated_count,
          'unchanged', latest.unchanged_count,
          'closed', latest.closed_count,
          'truncated', latest.truncated,
          'incompleteness_reasons', coalesce(
            to_jsonb(latest.incompleteness_reasons), '[]'::jsonb
          )
        ) as feed
        from app.job_sources s
        join private.ats_source_configs cfg on cfg.source_id = s.id
        join app.companies c on c.id = cfg.company_id
        left join lateral (
          select m.* from private.feed_run_metrics m
          where m.feed_key = s.adapter_key
          order by m.run_at desc, m.created_at desc
          limit 1
        ) latest on true
        left join lateral (
          select m.run_at from private.feed_run_metrics m
          where m.feed_key = s.adapter_key and m.snapshot_complete
          order by m.run_at desc
          limit 1
        ) complete_run on true
        where s.source_type = 'direct_employer'
          and cfg.provider in (
            'employer_xml_feed', 'employer_json_feed', 'employer_csv_import'
          )
      ) feeds
    ), '[]'::jsonb),
    -- The global kill switches, so an operator sees the outer gate too.
    'global_policies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'adapter_key', source.adapter_key,
        'status', source.status,
        'authorization_basis', source.authorization_basis
      ) order by source.adapter_key)
      from app.job_sources source
      where source.adapter_key in (
        'employer_xml_json_feeds', 'employer_csv_import'
      )
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function api.admin_get_employer_feed_health()
  from public, anon;
grant execute on function api.admin_get_employer_feed_health() to authenticated;

commit;
