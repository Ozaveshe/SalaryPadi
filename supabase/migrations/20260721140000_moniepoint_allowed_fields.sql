-- Align the Moniepoint board's reviewed field list with the canonical
-- record keys the ingestion pipeline actually submits. The raw-record
-- policy check maps canonical keys through provider synonyms (url,
-- application_url, publication_date, employment_type); the original list
-- named only raw Greenhouse fields, so every record was refused as an
-- unpermitted field.

begin;

update app.job_sources
set allowed_fields = array[
      'id', 'title', 'absolute_url', 'url', 'application_url',
      'location', 'departments', 'offices',
      'employment_type', 'publication_date', 'updated_at'
    ],
    updated_at = clock_timestamp()
where adapter_key = 'moniepoint_greenhouse';

update app.source_country_rights r
set allowed_fields = s.allowed_fields,
    updated_at = clock_timestamp()
from app.job_sources s
where s.adapter_key = 'moniepoint_greenhouse'
  and r.source_id = s.id;

commit;
