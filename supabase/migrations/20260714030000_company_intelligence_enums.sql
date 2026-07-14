-- Enum additions are isolated because PostgreSQL does not allow a value added
-- to an enum to be used until the transaction adding it has committed.

alter type private.contribution_kind add value if not exists 'benefits';
alter type private.contribution_kind add value if not exists 'pay_reliability';

alter type private.report_target_kind add value if not exists 'salary';
alter type private.report_target_kind add value if not exists 'benefit';
alter type private.report_target_kind add value if not exists 'pay_reliability';
alter type private.report_target_kind add value if not exists 'employer_response';
alter type private.report_target_kind add value if not exists 'contribution';

alter type private.moderation_flag_kind add value if not exists 'coordinated_campaign';
alter type private.moderation_flag_kind add value if not exists 'serious_allegation';
alter type private.moderation_flag_kind add value if not exists 'malicious_text';
