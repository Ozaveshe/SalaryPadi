-- CBN regulatory-license facts for companies confirmed in the official
-- Central Bank of Nigeria licensed microfinance banks register
-- (https://www.cbn.gov.ng/supervision/Inst-MF.html, served by the public
-- /api/GetMFBs endpoint; verified 2026-07-22: "KUDA MFB" id 3652,
-- "FAIRMONEY MFB LTD" id 3463). Moniepoint is deliberately absent: its MFB
-- entity could not be confirmed in this register and no fact is recorded
-- without an official source.
--
-- RUN AFTER the regulatory-license rendering code (contracts fact_value +
-- company page) deploys — the previously deployed contract rejects the new
-- fact key and would quarantine these companies' rows until then.

begin;

insert into app.company_fact_citations (
  company_id, fact_key, fact_value, source_kind, source_url, source_title,
  retrieved_at, fact_checked_at, review_due_at, status
)
select c.id, 'regulatory_license',
  jsonb_build_object(
    'value', 'Licensed microfinance bank',
    'authority', 'Central Bank of Nigeria',
    'register_name', data.register_name
  ),
  'public_registry',
  'https://www.cbn.gov.ng/supervision/Inst-MF.html',
  'CBN — Licensed Microfinance Banks register',
  timestamptz '2026-07-22 00:00:00+00', timestamptz '2026-07-22 00:00:00+00',
  timestamptz '2027-01-22 00:00:00+00', 'current'
from (values
  ('kuda', 'KUDA MFB'),
  ('fairmoney', 'FAIRMONEY MFB LTD')
) as data(slug, register_name)
join app.companies c on c.slug = data.slug
where not exists (
  select 1 from app.company_fact_citations f
  where f.company_id = c.id and f.fact_key = 'regulatory_license'
);

commit;
