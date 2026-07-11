-- Cover every foreign key that lacked a supporting index.
--
-- Source: Supabase performance advisor (unindexed_foreign_keys) run against
-- the production project on 2026-07-10. Un-covered foreign keys make row
-- deletes and joins on the referencing side scan the whole table. All of
-- these tables are low-write, so the index maintenance cost is negligible.
--
-- Generated from pg_constraint; names follow <table>_<column>_idx.

create index if not exists aggregate_runs_rule_version_id_idx on app.aggregate_runs (rule_version_id);
create index if not exists company_rating_snapshots_aggregate_run_id_idx on app.company_rating_snapshots (aggregate_run_id);
create index if not exists company_rating_snapshots_rule_version_id_idx on app.company_rating_snapshots (rule_version_id);
create index if not exists interview_publications_role_family_id_idx on app.interview_publications (role_family_id);
create index if not exists job_eligibility_verified_by_idx on app.job_eligibility (verified_by);
create index if not exists job_risk_indicators_reviewed_by_idx on app.job_risk_indicators (reviewed_by);
create index if not exists job_skills_skill_id_idx on app.job_skills (skill_id);
create index if not exists job_sources_terms_reviewed_by_idx on app.job_sources (terms_reviewed_by);
create index if not exists jobs_canonical_job_id_idx on app.jobs (canonical_job_id);
create index if not exists jobs_role_family_id_idx on app.jobs (role_family_id);
create index if not exists review_publications_role_family_id_idx on app.review_publications (role_family_id);
create index if not exists role_families_parent_id_idx on app.role_families (parent_id);
create index if not exists salary_aggregate_snapshots_aggregate_run_id_idx on app.salary_aggregate_snapshots (aggregate_run_id);
create index if not exists salary_aggregate_snapshots_company_id_idx on app.salary_aggregate_snapshots (company_id);
create index if not exists salary_aggregate_snapshots_role_family_id_idx on app.salary_aggregate_snapshots (role_family_id);
create index if not exists salary_aggregate_snapshots_rule_version_id_idx on app.salary_aggregate_snapshots (rule_version_id);
create index if not exists feed_posts_author_profile_id_idx on community.feed_posts (author_profile_id);
create index if not exists feed_posts_state_code_idx on community.feed_posts (state_code);
create index if not exists forum_replies_author_profile_id_idx on community.forum_replies (author_profile_id);
create index if not exists forum_threads_author_profile_id_idx on community.forum_threads (author_profile_id);
create index if not exists member_profiles_state_code_idx on community.member_profiles (state_code);
create index if not exists import_runs_retry_of_idx on ingest.import_runs (retry_of);
create index if not exists raw_job_records_import_run_id_idx on ingest.raw_job_records (import_run_id);
create index if not exists alert_deliveries_user_id_idx on private.alert_deliveries (user_id);
create index if not exists application_history_user_id_idx on private.application_history (user_id);
create index if not exists applications_external_job_id_idx on private.applications (external_job_id);
create index if not exists applications_job_id_idx on private.applications (job_id);
create index if not exists company_claims_company_id_idx on private.company_claims (company_id);
create index if not exists company_claims_reviewed_by_idx on private.company_claims (reviewed_by);
create index if not exists company_memberships_company_id_idx on private.company_memberships (company_id);
create index if not exists company_memberships_verified_by_idx on private.company_memberships (verified_by);
create index if not exists company_reviews_role_family_id_idx on private.company_reviews (role_family_id);
create index if not exists contributions_supersedes_contribution_id_idx on private.contributions (supersedes_contribution_id);
create index if not exists employer_job_submissions_company_id_idx on private.employer_job_submissions (company_id);
create index if not exists interview_experiences_role_family_id_idx on private.interview_experiences (role_family_id);
create index if not exists moderated_payloads_updated_by_idx on private.moderated_payloads (updated_by);
create index if not exists moderation_actions_actor_user_id_idx on private.moderation_actions (actor_user_id);
create index if not exists moderation_actions_linked_case_id_idx on private.moderation_actions (linked_case_id);
create index if not exists moderation_cases_assigned_to_idx on private.moderation_cases (assigned_to);
create index if not exists moderation_cases_report_id_idx on private.moderation_cases (report_id);
create index if not exists moderation_flags_case_id_idx on private.moderation_flags (case_id);
create index if not exists moderation_flags_resolved_by_idx on private.moderation_flags (resolved_by);
create index if not exists privacy_requests_handled_by_idx on private.privacy_requests (handled_by);
create index if not exists reports_resolved_by_idx on private.reports (resolved_by);
create index if not exists salary_submissions_role_family_id_idx on private.salary_submissions (role_family_id);
create index if not exists saved_jobs_external_job_id_idx on private.saved_jobs (external_job_id);
create index if not exists saved_jobs_job_id_idx on private.saved_jobs (job_id);
create index if not exists user_roles_granted_by_idx on private.user_roles (granted_by);
create index if not exists user_roles_revoked_by_idx on private.user_roles (revoked_by);
