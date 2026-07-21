-- Expand the reviewed Himalayas request budget from three to six pages per
-- daily fetch. Himalayas documents per-second rate pacing and no daily cap;
-- the original three-page budget was a conservative first review. The deeper
-- Nigeria-eligible catalog (five populated pages at review time) stays within
-- fair use at one paced six-page fetch per day.

begin;

update app.job_sources
set maximum_requests_per_day = 6,
    admin_version = admin_version + 1,
    updated_at = clock_timestamp()
where adapter_key = 'himalayas';

commit;
