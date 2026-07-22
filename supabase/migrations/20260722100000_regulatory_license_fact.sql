-- Admit regulator license status as a citable company fact. Nigerian trust
-- questions start with "is this employer actually licensed?", and the CBN,
-- PENCOM, NAICOM and NCC registers are official public sources for exactly
-- that fact. The fact-key allowlist gains 'regulatory_license', and the
-- public companies view exposes the fact value for that key only (other
-- fact values remain internal; their public representations already exist
-- as dedicated columns).

begin;

alter table app.company_fact_citations
  drop constraint company_fact_key_allowlist;
alter table app.company_fact_citations
  add constraint company_fact_key_allowlist
  check (fact_key = any (array[
    'brand_name'::text, 'legal_name'::text, 'alias'::text,
    'official_domain'::text, 'office'::text, 'headquarters_country'::text,
    'industry'::text, 'website'::text, 'size_band'::text,
    'employer_description'::text, 'employer_benefit'::text,
    'employer_policy'::text, 'regulatory_license'::text
  ]));

create or replace view api.companies
with (security_invoker = true, security_barrier = true) as
 select id,
    slug,
    display_name,
        case
            when (exists ( select 1
               from app.company_fact_citations f
              where f.company_id = c.id and f.fact_key = 'website'::text and (f.status = any (array['current'::app.company_fact_status, 'review_due'::app.company_fact_status])))) then website_url
            else null::text
        end as website_url,
        case
            when (exists ( select 1
               from app.company_fact_citations f
              where f.company_id = c.id and f.fact_key = 'industry'::text and (f.status = any (array['current'::app.company_fact_status, 'review_due'::app.company_fact_status])))) then industry
            else null::text
        end as industry,
        case
            when (exists ( select 1
               from app.company_fact_citations f
              where f.company_id = c.id and f.fact_key = 'size_band'::text and (f.status = any (array['current'::app.company_fact_status, 'review_due'::app.company_fact_status])))) then size_band
            else null::text
        end as size_band,
        case
            when (exists ( select 1
               from app.company_fact_citations f
              where f.company_id = c.id and f.fact_key = 'employer_description'::text and (f.status = any (array['current'::app.company_fact_status, 'review_due'::app.company_fact_status])))) then description
            else null::text
        end as description,
        case
            when (exists ( select 1
               from app.company_fact_citations f
              where f.company_id = c.id and f.fact_key = 'headquarters_country'::text and (f.status = any (array['current'::app.company_fact_status, 'review_due'::app.company_fact_status])))) then headquarters_country
            else null::text
        end as headquarters_country,
    verification_status,
    verification_scope,
    updated_at,
    coalesce(( select jsonb_agg(jsonb_build_object('country_code', l.country_code, 'city', l.city, 'region', l.region, 'location_type', l.location_type, 'is_primary', l.is_primary, 'last_verified_at', l.last_verified_at) order by l.is_primary desc, l.country_code, l.city) as jsonb_agg
           from app.company_locations l
          where l.company_id = c.id), '[]'::jsonb) as locations,
    coalesce(( select jsonb_agg(jsonb_build_object('legal_name', e.legal_name, 'registration_country', e.registration_country, 'entity_status', e.entity_status, 'citation_id', e.citation_id) order by e.legal_name) as jsonb_agg
           from app.company_legal_entities e
          where e.company_id = c.id), '[]'::jsonb) as legal_entities,
    coalesce(( select jsonb_agg(jsonb_build_object('alias', a.alias::text, 'alias_kind', a.alias_kind, 'citation_id', a.citation_id) order by (a.alias::text)) as jsonb_agg
           from app.company_aliases a
          where a.company_id = c.id), '[]'::jsonb) as aliases,
    coalesce(( select jsonb_agg(jsonb_build_object('domain', d.domain::text, 'domain_kind', d.domain_kind, 'verified_at', d.verified_at, 'review_due_at', d.review_due_at, 'citation_id', d.citation_id) order by (d.domain::text)) as jsonb_agg
           from app.company_domains d
          where d.company_id = c.id and d.is_official), '[]'::jsonb) as official_domains,
    coalesce(( select jsonb_agg(jsonb_build_object('id', f.id, 'fact_key', f.fact_key, 'source_kind', f.source_kind, 'source_url', f.source_url, 'source_title', f.source_title, 'source_published_at', f.source_published_at, 'retrieved_at', f.retrieved_at, 'fact_checked_at', f.fact_checked_at, 'review_due_at', f.review_due_at, 'status', f.status, 'fact_value',
                case when f.fact_key = 'regulatory_license'::text then f.fact_value end
              ) order by f.fact_key, f.fact_checked_at desc) as jsonb_agg
           from app.company_fact_citations f
          where f.company_id = c.id and (f.status = any (array['current'::app.company_fact_status, 'review_due'::app.company_fact_status]))), '[]'::jsonb) as citations
   from app.companies c
  where record_status = 'published'::app.record_status;

commit;
