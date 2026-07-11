begin;

-- PostgreSQL standard-conforming strings preserve backslashes. The original
-- migration used two backslashes before a literal dot, which made the regular
-- expression look for a backslash in valid hostnames and path segments.
create or replace function security.is_valid_ats_destination_arrays(
  p_hosts text[],
  p_path_prefixes text[]
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    coalesce(cardinality(p_hosts) between 1 and 20, false)
    and cardinality(p_hosts) = cardinality(p_path_prefixes)
    and not exists (
      select 1
      from unnest(p_hosts, p_path_prefixes) as destination(host, path_prefix)
      where destination.host is null
        or destination.host <> lower(destination.host)
        or char_length(destination.host) > 253
        or destination.host !~
          '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
        or destination.path_prefix is null
        or char_length(destination.path_prefix) not between 1 and 300
        or destination.path_prefix !~ '^/'
        or destination.path_prefix like '//%'
        or btrim(destination.path_prefix) <> destination.path_prefix
        or destination.path_prefix ~ '[?#]'
        or destination.path_prefix ~ '(^|/)\.\.(/|$)'
        or position(
          pg_catalog.chr(92) in destination.path_prefix
        ) > 0
    )
    and (
      select count(*) = count(distinct (destination.host, destination.path_prefix))
      from unnest(p_hosts, p_path_prefixes) as destination(host, path_prefix)
    )
$$;

revoke all on function security.is_valid_ats_destination_arrays(text[],text[])
from public, anon, authenticated, service_role;

commit;
