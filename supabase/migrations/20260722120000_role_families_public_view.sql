-- Expose the active role-family taxonomy read-only. The salaries hub and
-- the role salary pages need the family list to build their directory and
-- headings; slugs are already public identifiers in /salaries routes.

begin;

create or replace view api.role_families
with (security_invoker = true, security_barrier = true) as
select slug, name
from app.role_families
where is_active;

grant select on api.role_families to anon, authenticated;

commit;
