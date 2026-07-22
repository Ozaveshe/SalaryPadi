-- Extend the role-family taxonomy beyond tech-first roles to the families
-- that dominate Nigerian formal employment and map directly onto the
-- authoritative Nigerian pay structures (CONMESS covers medicine, CONHESS
-- health professionals, CONUASS academia, CONPSS the public service) and
-- onto the ONS/BLS occupation codes for future benchmark rows. Slugs are
-- stable identifiers; benchmarks and aggregate cells key on them.

begin;

insert into app.role_families (slug, name) values
  ('healthcare-medicine', 'Healthcare and Medicine'),
  ('nursing', 'Nursing'),
  ('pharmacy', 'Pharmacy'),
  ('education-academia', 'Education and Academia'),
  ('public-service', 'Public Service and Administration'),
  ('banking-operations', 'Banking Operations'),
  ('engineering', 'Engineering'),
  ('legal', 'Legal'),
  ('logistics-supply-chain', 'Logistics and Supply Chain'),
  ('media-communications', 'Media and Communications')
on conflict (slug) do update
set name = excluded.name,
    is_active = true;

commit;
