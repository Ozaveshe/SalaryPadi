-- Complete the Moniepoint board activation. Registering the ATS
-- configuration correctly revoked the earlier authorization review
-- (configuration changes always force re-review), so this migration
-- records the post-configuration review, fills the supply-policy rights
-- fields the activation guard requires, and activates the source.

begin;

update app.job_sources
set authorization_reviewed_at = clock_timestamp(),
    authorization_revoked_at = null,
    authorization_revocation_reason = null,
    terms_reviewed_at = clock_timestamp(),
    policy_state = 'enabled',
    authority = 'direct_employer',
    allowed_fields = array[
      'id', 'title', 'absolute_url', 'location', 'updated_at',
      'departments', 'offices'
    ],
    policy_review_due_at = clock_timestamp() + interval '6 months',
    raw_retention = interval '1 day',
    minimum_poll_interval = interval '6 hours',
    maximum_requests_per_day = 4,
    required_dependencies = array[
      'employer_application_destination', 'clickable_source_attribution'
    ]::text[],
    missing_dependencies = '{}'::text[]
where adapter_key = 'moniepoint_greenhouse';

update app.job_sources
set status = 'active'
where adapter_key = 'moniepoint_greenhouse'
  and status <> 'active';

commit;
