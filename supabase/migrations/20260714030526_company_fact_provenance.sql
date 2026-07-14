begin;

do $$
begin
  create type app.company_fact_source_kind as enum (
    'official_site',
    'public_filing',
    'public_registry',
    'verified_employer_submission'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type app.company_fact_status as enum (
    'current', 'review_due', 'superseded', 'withdrawn'
  );
exception when duplicate_object then null;
end;
$$;

create table if not exists app.company_fact_citations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  fact_key text not null,
  fact_value jsonb not null,
  source_kind app.company_fact_source_kind not null,
  source_url text not null,
  source_title text not null,
  source_published_at date,
  retrieved_at timestamptz not null,
  fact_checked_at timestamptz not null,
  review_due_at timestamptz not null,
  status app.company_fact_status not null default 'current',
  employer_claim_id uuid references private.company_claims(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, fact_key, source_url),
  constraint company_fact_key_allowlist check (fact_key in (
    'brand_name', 'legal_name', 'alias', 'official_domain', 'office',
    'headquarters_country', 'industry', 'website', 'size_band',
    'employer_description', 'employer_benefit', 'employer_policy'
  )),
  constraint company_fact_value_object check (jsonb_typeof(fact_value) = 'object'),
  constraint company_fact_value_size check (octet_length(fact_value::text) <= 8192),
  constraint company_fact_source_https check (source_url ~* '^https://'),
  constraint company_fact_title_length check (char_length(source_title) between 2 and 300),
  constraint company_fact_freshness_order check (review_due_at > fact_checked_at),
  constraint company_fact_employer_evidence check (
    source_kind <> 'verified_employer_submission' or employer_claim_id is not null
  )
);

create index if not exists company_fact_citations_public
  on app.company_fact_citations (company_id, status, fact_key, fact_checked_at desc);
create index if not exists company_fact_citations_review_due
  on app.company_fact_citations (review_due_at)
  where status in ('current', 'review_due');

create table if not exists app.company_legal_entities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  legal_name text not null,
  registration_country text,
  registration_identifier text,
  entity_status text not null default 'active',
  citation_id uuid not null references app.company_fact_citations(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, legal_name, registration_country),
  constraint company_legal_name_length check (char_length(legal_name) between 2 and 240),
  constraint company_legal_country_format check (
    registration_country is null or registration_country ~ '^[A-Z]{2}$'
  ),
  constraint company_legal_identifier_length check (
    registration_identifier is null or char_length(registration_identifier) <= 160
  )
);

create table if not exists app.company_domains (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references app.companies(id) on delete cascade,
  domain extensions.citext not null,
  domain_kind text not null default 'corporate',
  is_official boolean not null default true,
  citation_id uuid not null references app.company_fact_citations(id) on delete restrict,
  verified_at timestamptz not null,
  review_due_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (domain),
  constraint company_domains_format check (
    domain::text ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
  ),
  constraint company_domains_kind check (domain_kind in ('corporate', 'careers', 'subsidiary')),
  constraint company_domains_review_order check (review_due_at > verified_at)
);

alter table app.company_aliases
  add column if not exists alias_kind text not null default 'brand_alias',
  add column if not exists citation_id uuid references app.company_fact_citations(id) on delete set null;

alter table app.company_aliases
  drop constraint if exists company_aliases_kind;
alter table app.company_aliases
  add constraint company_aliases_kind
  check (alias_kind in ('brand_alias', 'former_name', 'trading_name', 'subsidiary'));

alter table app.company_locations
  add column if not exists citation_id uuid references app.company_fact_citations(id) on delete set null,
  add column if not exists last_verified_at timestamptz;

alter table private.contributions add column if not exists origin_kind text;
alter table private.contributions add column if not exists origin_attested_at timestamptz;
alter table private.contributions add column if not exists permission_basis text;
alter table private.contributions
  alter column origin_kind set default 'first_party_user',
  alter column origin_attested_at set default clock_timestamp(),
  alter column permission_basis set default 'salarypadi_first_party_terms';
alter table private.contributions
  drop constraint if exists contributions_origin_kind;
alter table private.contributions
  add constraint contributions_origin_kind check (
    origin_kind is null or origin_kind in ('first_party_user', 'verified_employer')
  );

create table if not exists audit.company_opinion_quarantine (
  id uuid primary key default gen_random_uuid(),
  source_relation text not null,
  source_id uuid not null,
  company_id uuid,
  content_hash text not null,
  reason_code text not null,
  original_status text,
  quarantined_at timestamptz not null default clock_timestamp(),
  migration_version text not null default '20260714030100',
  unique (source_relation, source_id),
  constraint company_opinion_quarantine_relation check (source_relation in (
    'app.review_publications', 'app.interview_publications', 'app.company_benefits'
  )),
  constraint company_opinion_quarantine_hash check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint company_opinion_quarantine_reason check (reason_code in (
    'missing_first_party_attestation', 'missing_contribution_provenance'
  ))
);

drop trigger if exists company_opinion_quarantine_append_only
  on audit.company_opinion_quarantine;
create trigger company_opinion_quarantine_append_only
before update or delete on audit.company_opinion_quarantine
for each row execute function security.reject_mutation();

insert into audit.company_opinion_quarantine (
  source_relation, source_id, company_id, content_hash, reason_code, original_status
)
select
  'app.review_publications', p.id, p.company_id,
  encode(extensions.digest(concat_ws('|', p.pros, p.cons, p.advice_to_management), 'sha256'), 'hex'),
  'missing_first_party_attestation', p.publication_status::text
from app.review_publications p
join private.contributions c on c.id = p.source_contribution_id
where c.origin_kind is null
   or c.origin_kind <> 'first_party_user'
   or c.origin_attested_at is null
on conflict (source_relation, source_id) do nothing;

update app.review_publications p
set publication_status = 'removed'
from audit.company_opinion_quarantine q
where q.source_relation = 'app.review_publications'
  and q.source_id = p.id;

insert into audit.company_opinion_quarantine (
  source_relation, source_id, company_id, content_hash, reason_code, original_status
)
select
  'app.interview_publications', p.id, p.company_id,
  encode(extensions.digest(concat_ws('|', p.question_themes, p.general_experience), 'sha256'), 'hex'),
  'missing_first_party_attestation', p.publication_status::text
from app.interview_publications p
join private.contributions c on c.id = p.source_contribution_id
where c.origin_kind is null
   or c.origin_kind <> 'first_party_user'
   or c.origin_attested_at is null
on conflict (source_relation, source_id) do nothing;

update app.interview_publications p
set publication_status = 'removed'
from audit.company_opinion_quarantine q
where q.source_relation = 'app.interview_publications'
  and q.source_id = p.id;

insert into audit.company_opinion_quarantine (
  source_relation, source_id, company_id, content_hash, reason_code, original_status
)
select
  'app.company_benefits', b.id, b.company_id,
  encode(extensions.digest(concat_ws('|', b.benefit_code, b.label, b.description), 'sha256'), 'hex'),
  'missing_contribution_provenance', b.record_status::text
from app.company_benefits b
where b.source_kind = 'community_reported'
on conflict (source_relation, source_id) do nothing;

update app.company_benefits b
set record_status = 'removed'
from audit.company_opinion_quarantine q
where q.source_relation = 'app.company_benefits'
  and q.source_id = b.id;

create or replace function security.enforce_first_party_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from private.contributions c
    where c.id = new.source_contribution_id
      and c.origin_kind = 'first_party_user'
      and c.origin_attested_at is not null
      and c.permission_basis = 'salarypadi_first_party_terms'
  ) then
    raise exception using
      errcode = '23514',
      message = 'only attested first-party contributions may be published';
  end if;
  return new;
end;
$$;

drop trigger if exists review_publication_first_party_only on app.review_publications;
create trigger review_publication_first_party_only
before insert or update of publication_status on app.review_publications
for each row when (new.publication_status = 'published')
execute function security.enforce_first_party_publication();

drop trigger if exists interview_publication_first_party_only on app.interview_publications;
create trigger interview_publication_first_party_only
before insert or update of publication_status on app.interview_publications
for each row when (new.publication_status = 'published')
execute function security.enforce_first_party_publication();

-- Three currently visible source-derived shells receive only facts confirmed by
-- reachable official company pages. No description, rating, salary or opinion
-- is seeded. Applying this migration is a separate production change.
insert into app.companies (
  slug, display_name, website_url, website_domain, record_status
)
values
  ('coalition-technologies', 'Coalition Technologies', 'https://coalitiontechnologies.com/', 'coalitiontechnologies.com', 'published'),
  ('telus-digital', 'TELUS Digital', 'https://www.telusdigital.com/', 'telusdigital.com', 'published'),
  ('lawnstarter', 'LawnStarter', 'https://www.lawnstarter.com/', 'lawnstarter.com', 'published')
on conflict (slug) do update
set website_url = coalesce(app.companies.website_url, excluded.website_url),
    website_domain = coalesce(app.companies.website_domain, excluded.website_domain),
    updated_at = clock_timestamp();

with sources(slug, source_url, source_title, domain) as (
  values
    ('coalition-technologies', 'https://coalitiontechnologies.com/who-we-are', 'Coalition Technologies Team', 'coalitiontechnologies.com'),
    ('telus-digital', 'https://www.telusdigital.com/', 'TELUS Digital official website', 'telusdigital.com'),
    ('lawnstarter', 'https://www.lawnstarter.com/', 'LawnStarter official website', 'lawnstarter.com')
)
insert into app.company_fact_citations (
  company_id, fact_key, fact_value, source_kind, source_url, source_title,
  retrieved_at, fact_checked_at, review_due_at
)
select
  c.id, facts.fact_key,
  case facts.fact_key
    when 'brand_name' then jsonb_build_object('value', c.display_name)
    when 'website' then jsonb_build_object('value', c.website_url)
    else jsonb_build_object('value', s.domain)
  end,
  'official_site', s.source_url, s.source_title,
  timestamptz '2026-07-14 00:00:00+00',
  timestamptz '2026-07-14 00:00:00+00',
  timestamptz '2027-01-14 00:00:00+00'
from sources s
join app.companies c on c.slug = s.slug
cross join (values ('brand_name'), ('website'), ('official_domain')) facts(fact_key)
on conflict (company_id, fact_key, source_url) do nothing;

insert into app.company_domains (
  company_id, domain, domain_kind, is_official, citation_id, verified_at, review_due_at
)
select
  c.id, c.website_domain, 'corporate', true, f.id,
  f.fact_checked_at, f.review_due_at
from app.companies c
join app.company_fact_citations f
  on f.company_id = c.id and f.fact_key = 'official_domain'
where c.slug in ('coalition-technologies', 'telus-digital', 'lawnstarter')
on conflict (domain) do nothing;

drop trigger if exists company_fact_citations_set_updated_at on app.company_fact_citations;
create trigger company_fact_citations_set_updated_at
before update on app.company_fact_citations
for each row execute function security.set_updated_at();
drop trigger if exists company_legal_entities_set_updated_at on app.company_legal_entities;
create trigger company_legal_entities_set_updated_at
before update on app.company_legal_entities
for each row execute function security.set_updated_at();

alter table app.company_fact_citations enable row level security;
alter table app.company_fact_citations force row level security;
alter table app.company_legal_entities enable row level security;
alter table app.company_legal_entities force row level security;
alter table app.company_domains enable row level security;
alter table app.company_domains force row level security;
alter table audit.company_opinion_quarantine enable row level security;
alter table audit.company_opinion_quarantine force row level security;

drop policy if exists company_fact_citations_public_read on app.company_fact_citations;
create policy company_fact_citations_public_read on app.company_fact_citations
for select to anon, authenticated using (
  status in ('current', 'review_due')
  and exists (
    select 1 from app.companies c
    where c.id = company_id and c.record_status = 'published'
  )
);
drop policy if exists company_legal_entities_public_read on app.company_legal_entities;
create policy company_legal_entities_public_read on app.company_legal_entities
for select to anon, authenticated using (
  exists (
    select 1 from app.companies c
    where c.id = company_id and c.record_status = 'published'
  )
);
drop policy if exists company_domains_public_read on app.company_domains;
create policy company_domains_public_read on app.company_domains
for select to anon, authenticated using (
  is_official and exists (
    select 1 from app.companies c
    where c.id = company_id and c.record_status = 'published'
  )
);
drop policy if exists company_opinion_quarantine_staff_read on audit.company_opinion_quarantine;
create policy company_opinion_quarantine_staff_read on audit.company_opinion_quarantine
for select to authenticated using ((select security.can_moderate()));

create or replace view api.companies
with (security_invoker = true, security_barrier = true)
as
select
  c.id, c.slug, c.display_name,
  case when exists (
    select 1 from app.company_fact_citations f
    where f.company_id = c.id and f.fact_key = 'website'
      and f.status in ('current', 'review_due')
  ) then c.website_url else null end as website_url,
  case when exists (
    select 1 from app.company_fact_citations f
    where f.company_id = c.id and f.fact_key = 'industry'
      and f.status in ('current', 'review_due')
  ) then c.industry else null end as industry,
  case when exists (
    select 1 from app.company_fact_citations f
    where f.company_id = c.id and f.fact_key = 'size_band'
      and f.status in ('current', 'review_due')
  ) then c.size_band else null end as size_band,
  case when exists (
    select 1 from app.company_fact_citations f
    where f.company_id = c.id and f.fact_key = 'employer_description'
      and f.status in ('current', 'review_due')
  ) then c.description else null end as description,
  case when exists (
    select 1 from app.company_fact_citations f
    where f.company_id = c.id and f.fact_key = 'headquarters_country'
      and f.status in ('current', 'review_due')
  ) then c.headquarters_country else null end as headquarters_country,
  c.verification_status, c.verification_scope, c.updated_at,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'country_code', l.country_code, 'city', l.city, 'region', l.region,
      'location_type', l.location_type, 'is_primary', l.is_primary,
      'last_verified_at', l.last_verified_at
    ) order by l.is_primary desc, l.country_code, l.city)
    from app.company_locations l where l.company_id = c.id
  ), '[]'::jsonb) as locations,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'legal_name', e.legal_name,
      'registration_country', e.registration_country,
      'entity_status', e.entity_status,
      'citation_id', e.citation_id
    ) order by e.legal_name)
    from app.company_legal_entities e where e.company_id = c.id
  ), '[]'::jsonb) as legal_entities,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'alias', a.alias::text, 'alias_kind', a.alias_kind,
      'citation_id', a.citation_id
    ) order by a.alias::text)
    from app.company_aliases a where a.company_id = c.id
  ), '[]'::jsonb) as aliases,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'domain', d.domain::text, 'domain_kind', d.domain_kind,
      'verified_at', d.verified_at, 'review_due_at', d.review_due_at,
      'citation_id', d.citation_id
    ) order by d.domain::text)
    from app.company_domains d where d.company_id = c.id and d.is_official
  ), '[]'::jsonb) as official_domains,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id, 'fact_key', f.fact_key, 'source_kind', f.source_kind,
      'source_url', f.source_url, 'source_title', f.source_title,
      'source_published_at', f.source_published_at,
      'retrieved_at', f.retrieved_at, 'fact_checked_at', f.fact_checked_at,
      'review_due_at', f.review_due_at, 'status', f.status
    ) order by f.fact_key, f.fact_checked_at desc)
    from app.company_fact_citations f
    where f.company_id = c.id and f.status in ('current', 'review_due')
  ), '[]'::jsonb) as citations
from app.companies c
where c.record_status = 'published';

grant select on app.company_fact_citations, app.company_legal_entities,
  app.company_domains to anon, authenticated;
grant select on audit.company_opinion_quarantine to authenticated;
grant select on api.companies to anon, authenticated;

comment on table app.company_fact_citations is
  'Factual company claims only. Third-party review, rating, salary, interview, or community text is not an allowed source kind.';
comment on table audit.company_opinion_quarantine is
  'Append-only, text-free quarantine evidence. It keeps hashes and prior states without retaining copied opinion on public surfaces.';

revoke all on function security.enforce_first_party_publication() from public, anon, authenticated, service_role;

commit;
