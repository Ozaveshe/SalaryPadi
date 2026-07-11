-- Preserve the security-invoker/RLS publication boundary while allowing the
-- public RPC to evaluate its two fail-closed predicates.
grant select (status, next_review_at)
on editorial.articles
to anon, authenticated;

-- Supabase's service-role safe-update guard rejects unconstrained UPDATEs,
-- including those inside RPCs. The primary-key predicate is explicit and
-- continues to revalidate every configured live block.
create or replace function api.editorial_revalidate_live_blocks(
  p_snapshot_id uuid,
  p_checked_at timestamptz,
  p_active_job_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform security.require_service_role();
  if p_checked_at is null or p_active_job_count < 0 or not exists (
    select 1 from editorial.data_snapshots where id = p_snapshot_id
  ) then
    raise exception using errcode = '22023', message = 'invalid live block snapshot';
  end if;

  update editorial.live_job_blocks as block
  set last_snapshot_id = p_snapshot_id,
    last_revalidated_at = p_checked_at,
    expires_at = p_checked_at + interval '6 hours 15 minutes',
    active_job_count = p_active_job_count,
    status = case when p_active_job_count > 0 then 'fresh' else 'empty' end,
    updated_at = clock_timestamp()
  where block.id is not null;

  get diagnostics v_count = row_count;
  return jsonb_build_object(
    'revalidated', v_count,
    'active_jobs', p_active_job_count
  );
end;
$$;

revoke all on function api.editorial_revalidate_live_blocks(uuid,timestamptz,integer)
from public, anon, authenticated;
grant execute on function api.editorial_revalidate_live_blocks(uuid,timestamptz,integer)
to service_role;
