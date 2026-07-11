begin;

-- The public jobs RLS policy must check source authorization without granting
-- anonymous callers direct SELECT access to private evidence columns.
create or replace function security.is_public_job_source(
  p_source_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.job_sources source
    where source.id = p_source_id
      and source.status = 'active'
      and source.allow_public_listing
      and source.terms_reviewed_at is not null
      and source.authorization_basis is not null
      and source.authorization_evidence_ref is not null
      and source.authorization_reviewed_at is not null
      and source.authorization_revoked_at is null
      and (
        source.authorization_expires_at is null
        or source.authorization_expires_at > clock_timestamp()
      )
  )
$$;

revoke all on function security.is_public_job_source(uuid)
from public, anon, authenticated, service_role;
grant execute on function security.is_public_job_source(uuid)
to anon, authenticated;

drop policy if exists jobs_public_read on app.jobs;
create policy jobs_public_read on app.jobs
for select to anon, authenticated using (
  status = 'published'
  and not is_fixture
  and (valid_through is null or valid_through > clock_timestamp())
  and (select security.is_public_job_source(source_id))
);

commit;
