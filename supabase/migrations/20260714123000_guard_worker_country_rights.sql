-- Keep the worker-only country-rights boundary fail-closed even if function
-- privileges drift in a later migration. The explicit guard complements the
-- service_role-only EXECUTE grant rather than replacing it.
create or replace function api.worker_get_source_country_rights(p_source_id uuid)
returns table (country_code text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform security.require_service_role();

  return query
  select rights.country_code
  from app.source_country_rights rights
  where rights.source_id = p_source_id
    and security.job_source_country_policy_is_runnable(
      rights.source_id, rights.country_code
    )
    and exists (
      select 1
      from app.market_countries country
      where country.iso2 = rights.country_code
        and country.public_routes_enabled
        and country.pack_state in ('launch', 'active')
    )
  order by rights.country_code;
end;
$$;

revoke all on function api.worker_get_source_country_rights(uuid)
from public, anon, authenticated;
grant execute on function api.worker_get_source_country_rights(uuid)
to service_role;
