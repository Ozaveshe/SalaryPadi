-- Seed the role-family taxonomy. Salary benchmarks, salary aggregate cells
-- and the /salaries/[country]/[role] routes all key on these slugs; until now
-- the table was empty, so no benchmark row could ever reference a role.
-- Slugs are stable identifiers; display names may be refined later.

begin;

insert into app.role_families (slug, name) values
  ('software-engineering', 'Software Engineering'),
  ('quality-assurance', 'Quality Assurance'),
  ('cybersecurity', 'Cybersecurity'),
  ('data-science', 'Data Science'),
  ('devops-infrastructure', 'DevOps and Infrastructure'),
  ('product-management', 'Product Management'),
  ('design', 'Design'),
  ('marketing', 'Marketing'),
  ('sales', 'Sales'),
  ('customer-support', 'Customer Support'),
  ('accounting-finance', 'Accounting and Finance'),
  ('human-resources', 'Human Resources'),
  ('project-management', 'Project Management')
on conflict (slug) do update
set name = excluded.name,
    is_active = true;

commit;
