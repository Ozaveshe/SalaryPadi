-- The anon read path evaluated the provenance stack twice more inside RLS:
-- jobs_public_read checked is_public_job_source, country distribution, and
-- remote eligibility explicitly, then ALSO required
-- security.public_job_provenance(id) is not null — a function that re-runs
-- all three internally. At 200+ published ATS jobs the anon feed query blew
-- the role statement timeout (57014) and the app degraded the reviewed
-- employer lane to "temporarily unavailable". The only provenance component
-- the policy did not already assert is occurrence-link evidence, so the
-- policy now checks that directly through a lean security-definer helper.

begin;

create or replace function security.job_has_occurrence_evidence(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from ingest.job_occurrence_links link
    where link.canonical_job_id = p_job_id
  );
$$;

revoke all on function security.job_has_occurrence_evidence(uuid)
from public, anon, authenticated, service_role;
grant execute on function security.job_has_occurrence_evidence(uuid)
to anon, authenticated;

drop policy if exists jobs_public_read on app.jobs;
create policy jobs_public_read on app.jobs
for select to anon, authenticated using (
  status = 'published'
  and lifecycle_state <> 'closed'
  and canonical_job_id is null
  and not is_fixture
  and (valid_through is null or valid_through > clock_timestamp())
  and (select security.is_public_job_source(source_id))
  and (select security.job_country_distribution_allowed(id, 'public'))
  and (select security.job_is_public_remote_eligible(id))
  and (select security.job_has_occurrence_evidence(id))
);

commit;
