begin;

alter table app.company_aliases enable row level security;
alter table app.company_aliases force row level security;

drop policy if exists company_aliases_public_read on app.company_aliases;
create policy company_aliases_public_read on app.company_aliases
for select to anon, authenticated using (
  exists (
    select 1
    from app.companies company
    where company.id = company_id
      and company.record_status = 'published'
  )
);

revoke all on table app.company_aliases from public, anon, authenticated;
grant select (company_id, alias, alias_kind, citation_id)
on app.company_aliases to anon, authenticated;

commit;
