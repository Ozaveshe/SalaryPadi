-- Record the verified evidence for ReliefWeb's two declared dependencies.
--
-- 20260726140000 registered the source and declared its required dependencies,
-- but security.job_source_policy_is_runnable additionally requires a VERIFIED
-- row in private.job_source_dependencies for each one, carrying an evidence
-- reference and a review date. Declaring a dependency is not the same as
-- having satisfied it — the source stayed non-runnable until this landed,
-- which is the gate behaving correctly.

begin;

insert into private.job_source_dependencies (
  source_id, dependency_key, state, evidence_reference, reviewed_at
)
select s.id, d.dependency_key, 'verified', d.evidence_reference, d.reviewed_at
from app.job_sources s
cross join (values
  (
    'preapproved_reliefweb_app_name',
    'ReliefWeb API appname approval email 2026-07-26; appname salarypadi-jobs-7k3q9x; support ref 00D6g022nMK/500PZ0so0Aj. Required on every call since 1 November 2025.',
    timestamptz '2026-07-26T00:00:00+00:00'
  ),
  (
    'original_content_field_review',
    'Operator field review 2026-07-26 against https://reliefweb.int/help/api: ReliefWeb content is contributed by information partners for re-publication, attributed to the original source with the original URL. SalaryPadi republishes listing metadata only (id, url, title, source, country, closing_date, job_type, career_category); the adapter requests seven metadata fields and sets body: null, so no partner prose is requested, stored or displayed. Every listing attributes ReliefWeb and the named information partner and links to the ReliefWeb URL.',
    timestamptz '2026-07-26T00:00:00+00:00'
  )
) as d(dependency_key, evidence_reference, reviewed_at)
where s.adapter_key = 'reliefweb'
on conflict (source_id, dependency_key) do update
set state = 'verified',
    evidence_reference = excluded.evidence_reference,
    reviewed_at = excluded.reviewed_at,
    updated_at = now();

commit;
