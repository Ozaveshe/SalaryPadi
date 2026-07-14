begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, api, app, private, community, security, audit;
select plan(34);

select is(
  (select string_agg(e.enumlabel, ',' order by e.enumsortorder)
   from pg_enum e where e.enumtypid = 'app.company_fact_source_kind'::regtype),
  'official_site,public_filing,public_registry,verified_employer_submission',
  'company facts accept only official, registry, filing, or verified-employer sources'
);
select ok(
  to_regclass('app.company_fact_citations') is not null
  and (select relrowsecurity from pg_class where oid = 'app.company_fact_citations'::regclass),
  'factual citations exist behind row-level security'
);
select ok(
  position('legal_entities' in pg_get_viewdef('api.companies'::regclass, true)) > 0
  and position('official_domains' in pg_get_viewdef('api.companies'::regclass, true)) > 0
  and position('citations' in pg_get_viewdef('api.companies'::regclass, true)) > 0,
  'the company public contract separates legal entities, official domains, and citations'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'app.company_aliases'::regclass)
  and exists (
    select 1 from pg_policy
    where polrelid = 'app.company_aliases'::regclass
      and polname = 'company_aliases_public_read'
  ),
  'public company aliases remain behind an explicit published-company policy'
);
select ok(
  has_column_privilege('anon', 'app.company_aliases', 'company_id', 'SELECT')
  and has_column_privilege('anon', 'app.company_aliases', 'alias', 'SELECT')
  and has_column_privilege('anon', 'app.company_aliases', 'alias_kind', 'SELECT')
  and has_column_privilege('anon', 'app.company_aliases', 'citation_id', 'SELECT')
  and not has_column_privilege('anon', 'app.company_aliases', 'source_note', 'SELECT')
  and not has_column_privilege('anon', 'app.company_aliases', 'match_method', 'SELECT')
  and not has_column_privilege('anon', 'app.company_aliases', 'confidence', 'SELECT'),
  'anonymous alias access is limited to the columns used by the public view'
);
set local role anon;
select lives_ok(
  'select * from api.companies limit 1',
  'anonymous callers can read the security-invoker company view'
);
reset role;
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'audit' and table_name = 'company_opinion_quarantine'
      and column_name in ('text', 'content', 'pros', 'cons', 'advice', 'review', 'salary')
  ),
  'quarantine retains hashes and state, never copied opinion text'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'audit.company_opinion_quarantine'::regclass
      and tgname = 'company_opinion_quarantine_append_only' and tgenabled = 'O'
  ),
  'opinion quarantine history is append-only'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'private.moderation_actions'::regclass
      and tgname = 'moderation_actions_append_only' and tgenabled = 'O'
  ),
  'moderation action history remains immutable'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'app.review_publications'::regclass
      and tgfoid = 'security.enforce_first_party_publication()'::regprocedure
      and tgenabled = 'O'
  ) and exists (
    select 1 from pg_trigger
    where tgrelid = 'app.interview_publications'::regclass
      and tgfoid = 'security.enforce_first_party_publication()'::regprocedure
      and tgenabled = 'O'
  ),
  'review and interview publication both require first-party provenance'
);
select ok(
  position('first_party_user' in pg_get_constraintdef(
    (select oid from pg_constraint where conrelid = 'private.contributions'::regclass
     and conname = 'contributions_origin_kind')
  )) > 0
  and position('verified_employer' in pg_get_constraintdef(
    (select oid from pg_constraint where conrelid = 'private.contributions'::regclass
     and conname = 'contributions_origin_kind')
  )) > 0,
  'raw contribution origins cannot be configured as an external review source'
);
select is(
  (select enabled from app.contribution_verification_programs
   where level = 'document_verified_later'),
  false,
  'document verification is disabled'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'private.contribution_verifications'::regclass
      and tgname = 'contribution_document_verification_disabled' and tgenabled = 'O'
  ),
  'the database rejects document verification even if the application is bypassed'
);
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema in ('app', 'private')
      and column_name ~* '(payslip|pay_slip|document_blob|attachment_blob|document_url)'
  ),
  'the company-intelligence schema has no payslip or document storage column'
);
select ok(
  position('90 days' in pg_get_constraintdef(
    (select oid from pg_constraint where conrelid = 'private.contribution_drafts'::regclass
     and conname = 'contribution_drafts_retention')
  )) > 0,
  'private drafts are bounded to 90 days'
);
select ok(
  position('30 days' in pg_get_constraintdef(
    (select oid from pg_constraint where conrelid = 'private.contribution_abuse_signals'::regclass
     and conname = 'contribution_abuse_retention')
  )) > 0,
  'unlinkable abuse signals are bounded to 30 days'
);
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'api' and table_name = 'employer_responses'
      and column_name in ('author_user_id', 'contributor_user_id', 'work_email', 'verification_evidence')
  ),
  'public employer responses cannot expose private author identity or evidence'
);
select ok(
  not has_table_privilege('anon', 'private.contributions', 'SELECT')
  and not has_table_privilege('anon', 'private.contribution_verifications', 'SELECT')
  and not has_table_privilege('anon', 'private.contribution_abuse_signals', 'SELECT'),
  'anonymous users cannot read contribution identity, verification, or abuse tables'
);
select ok(
  position('sample_size >= 5' in pg_get_viewdef('api.company_ratings'::regclass, true)) > 0,
  'overall ratings remain hidden below five approved independent reviews'
);
select ok(
  position('sample_size >= 5' in pg_get_viewdef('api.company_benefits'::regclass, true)) > 0,
  'community benefit aggregates remain hidden below five contributors'
);
select ok(
  position('sample_size >= 5' in pg_get_viewdef('api.pay_reliability_aggregates'::regclass, true)) > 0,
  'pay-reliability aggregates remain hidden below five contributors'
);
select ok(
  exists (select 1 from information_schema.columns where table_schema = 'api' and table_name = 'salary_aggregates' and column_name = 'verification_mix')
  and exists (select 1 from information_schema.columns where table_schema = 'api' and table_name = 'salary_aggregates' and column_name = 'source_month_from')
  and exists (select 1 from information_schema.columns where table_schema = 'api' and table_name = 'salary_aggregates' and column_name = 'source_month_to')
  and exists (select 1 from information_schema.columns where table_schema = 'api' and table_name = 'salary_aggregates' and column_name = 'sample_size'),
  'salary aggregates expose cohort, date range, verification mix, and sample size'
);
select ok(
  position('rating' in lower(pg_get_functiondef('security.transition_employer_response(uuid,integer,text,text,jsonb)'::regprocedure))) = 0
  and position('review_publications' in lower(pg_get_functiondef('security.transition_employer_response(uuid,integer,text,text,jsonb)'::regprocedure))) = 0,
  'employer response actions cannot mutate community ratings or reviews'
);
select ok(
  position('author_user_id' in pg_get_viewdef('api.employer_responses'::regclass, true)) = 0
  and position('work_email' in pg_get_viewdef('api.employer_responses'::regclass, true)) = 0,
  'the employer public view is identity-free by construction'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class
   where oid = 'private.employer_response_submissions'::regclass),
  'employer response submissions force row-level security'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'private.contribution_drafts'::regclass)
  and exists (
    select 1 from pg_policy
    where polrelid = 'private.contribution_drafts'::regclass
      and polname = 'contribution_drafts_owner_read'
  ),
  'draft reads are owner-scoped'
);
select ok(
  exists (select 1 from app.company_fact_citations where source_kind = 'official_site')
  and not exists (
    select 1 from app.company_fact_citations
    where source_kind::text not in ('official_site', 'public_filing', 'public_registry', 'verified_employer_submission')
  ),
  'prepared profile seeds contain only allowlisted factual citations'
);
select ok(
  has_function_privilege('authenticated', 'api.submit_contribution(text,jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'security.submit_benefits(jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'security.register_contribution_intake(uuid,jsonb)', 'EXECUTE'),
  'authenticated callers cannot bypass contribution intake and moderation registration'
);
select ok(
  has_function_privilege('authenticated', 'api.submit_employer_response(text,text,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'security.submit_employer_response(text,text,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'api.submit_employer_response(text,text,text,text)', 'EXECUTE'),
  'employer responses are reachable only through the authenticated public wrapper'
);
select ok(
  position('company_evidence_cohort_met' in pg_get_viewdef('api.company_reviews'::regclass, true)) > 0
  and position('WITHHELD' in pg_get_viewdef('api.company_reviews'::regclass, true)) > 0
  and position('null::text as employment_status' in lower(pg_get_viewdef('api.company_reviews'::regclass, true))) > 0,
  'public reviews require an independent cohort and withhold rare identity attributes'
);
select ok(
  position('company_evidence_cohort_met' in pg_get_viewdef('api.interview_experiences'::regclass, true)) > 0
  and position('WITHHELD' in pg_get_viewdef('api.interview_experiences'::regclass, true)) > 0
  and position('null::text as application_source' in lower(pg_get_viewdef('api.interview_experiences'::regclass, true))) > 0,
  'public interview accounts require a cohort and withhold identifying process attributes'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'private.privacy_requests'::regclass
      and tgname = 'privacy_request_contribution_owner'
      and tgfoid = 'security.enforce_contribution_deletion_ownership()'::regprocedure
      and tgenabled = 'O'
  ),
  'a user cannot request deletion of another contributor record'
);
select ok(
  position('contains_prohibited_company_evidence' in pg_get_functiondef('api.submit_contribution(text,jsonb)'::regprocedure)) > 0
  and position('contains_prohibited_company_evidence' in pg_get_functiondef('security.save_contribution_draft(private.contribution_kind,jsonb)'::regprocedure)) > 0,
  'direct RPC calls cannot bypass nested document and work-email rejection'
);
select ok(
  position('private.company_memberships' in pg_get_functiondef('security.register_contribution_intake(uuid,jsonb)'::regprocedure)) > 0
  and position('work_domain_verified' in pg_get_functiondef('security.register_contribution_intake(uuid,jsonb)'::regprocedure)) > 0,
  'work-domain verification requires a private verified company membership'
);

select * from finish();
rollback;
