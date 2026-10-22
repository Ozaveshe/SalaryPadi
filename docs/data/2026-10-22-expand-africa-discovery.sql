-- SalaryPadi only: bxelrhklsznmpksgrqep. Verified public widget responses 2026-10-22.
-- Vivo Energy: 26 postings, newest 2026-10-21; Rising Academies: 4, newest 2026-10-09;
-- AUTO24: 9, newest 2026-10-07. These existing configurations are unchanged.
begin;
update app.job_sources s set status = 'active'
from private.ats_source_configs c
where c.source_id = s.id and c.enabled
  and s.adapter_key in ('vivo_energy_workable','rising_academies_workable','auto24_workable')
  and s.status = 'paused' and s.policy_state = 'enabled'
  and s.authorization_basis = 'documented_public_api'
  and s.authorization_revoked_at is null
  and (s.authorization_expires_at is null or s.authorization_expires_at > now())
  and s.missing_dependencies = '{}'::text[];
-- Provider APIs support continuation requests. These are operational batch budgets,
-- not paid-provider quotas. Individual records retain their own evidence timestamps.
update app.job_sources set minimum_poll_interval = interval '15 minutes',
  maximum_requests_per_day = case adapter_key when 'jobicy' then 384 else 576 end
where adapter_key in ('jobicy','himalayas') and status = 'active';
commit;
