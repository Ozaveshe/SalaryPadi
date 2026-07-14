begin;

do $$
begin
  create type app.country_pack_state as enum (
    'candidate', 'launch', 'active', 'suspended'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type app.country_pack_review_state as enum (
    'pending', 'passed', 'failed', 'expired'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type app.statutory_rule_kind as enum (
    'tax', 'employment', 'privacy', 'moderation', 'takedown'
  );
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type app.statutory_rule_state as enum (
    'draft', 'reviewed', 'active', 'superseded'
  );
exception when duplicate_object then null;
end;
$$;

alter table app.market_countries
  add column if not exists iso3 text,
  add column if not exists slug text,
  add column if not exists region_code text,
  add column if not exists default_locale text,
  add column if not exists default_time_zone text,
  add column if not exists route_prefix text,
  add column if not exists pack_state app.country_pack_state not null default 'candidate',
  add column if not exists public_routes_enabled boolean not null default false,
  add column if not exists search_index_enabled boolean not null default false,
  add column if not exists min_authorized_active_jobs integer not null default 100,
  add column if not exists min_authorized_sources integer not null default 3,
  add column if not exists min_explicit_eligibility_ratio numeric(5,4) not null default 0.9500,
  add column if not exists min_unique_content_pages integer not null default 20,
  add column if not exists min_first_party_contributions integer not null default 10,
  add column if not exists activation_reviewed_by uuid references private.profiles(user_id) on delete set null,
  add column if not exists activation_reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update app.market_countries
set iso3 = case iso2
      when 'NG' then 'NGA' when 'GH' then 'GHA'
      when 'KE' then 'KEN' when 'ZA' then 'ZAF' else iso3 end,
    slug = case iso2
      when 'NG' then 'nigeria' when 'GH' then 'ghana'
      when 'KE' then 'kenya' when 'ZA' then 'south-africa' else slug end,
    region_code = case when iso2 in ('NG', 'GH', 'KE', 'ZA') then 'africa' else region_code end,
    default_locale = case iso2
      when 'NG' then 'en-NG' when 'GH' then 'en-GH'
      when 'KE' then 'en-KE' when 'ZA' then 'en-ZA' else default_locale end,
    default_time_zone = case iso2
      when 'NG' then 'Africa/Lagos' when 'GH' then 'Africa/Accra'
      when 'KE' then 'Africa/Nairobi' when 'ZA' then 'Africa/Johannesburg'
      else default_time_zone end,
    route_prefix = case iso2
      when 'NG' then '' when 'GH' then '/gh'
      when 'KE' then '/ke' when 'ZA' then '/za' else route_prefix end,
    pack_state = case when iso2 = 'NG'
      then 'launch'::app.country_pack_state
      else 'candidate'::app.country_pack_state end,
    public_routes_enabled = iso2 = 'NG',
    search_index_enabled = iso2 = 'NG',
    updated_at = clock_timestamp()
where iso2 in ('NG', 'GH', 'KE', 'ZA');

alter table app.market_countries
  drop constraint if exists market_countries_pack_shape;
alter table app.market_countries
  add constraint market_countries_pack_shape check (
    (iso3 is null or iso3 ~ '^[A-Z]{3}$')
    and (slug is null or slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
    and (route_prefix is null or route_prefix ~ '^(?:|/[a-z]{2})$')
    and (default_locale is null or char_length(default_locale) between 2 and 35)
    and (default_time_zone is null or char_length(default_time_zone) between 3 and 100)
    and min_authorized_active_jobs >= 20
    and min_authorized_sources >= 2
    and min_explicit_eligibility_ratio between 0.8000 and 1.0000
    and min_unique_content_pages >= 5
    and min_first_party_contributions >= 5
    and (not search_index_enabled or public_routes_enabled)
    and (
      (not public_routes_enabled and not search_index_enabled)
      or pack_state in ('launch', 'active')
    )
  );

create unique index if not exists market_countries_iso3_unique
  on app.market_countries (iso3) where iso3 is not null;
create unique index if not exists market_countries_slug_unique
  on app.market_countries (slug) where slug is not null;
create unique index if not exists market_countries_route_prefix_unique
  on app.market_countries (route_prefix) where route_prefix is not null;

drop trigger if exists market_countries_set_updated_at on app.market_countries;
create trigger market_countries_set_updated_at
before update on app.market_countries
for each row execute function security.set_updated_at();

create table if not exists app.currencies (
  code text primary key,
  name text not null,
  symbol text not null,
  minor_units smallint not null default 2,
  created_at timestamptz not null default now(),
  constraint currencies_code_format check (code ~ '^[A-Z]{3}$'),
  constraint currencies_name_length check (char_length(name) between 2 and 80),
  constraint currencies_symbol_length check (char_length(symbol) between 1 and 8),
  constraint currencies_minor_units check (minor_units between 0 and 4)
);

insert into app.currencies (code, name, symbol, minor_units) values
  ('NGN', 'Nigerian naira', '₦', 2),
  ('GHS', 'Ghanaian cedi', 'GH₵', 2),
  ('KES', 'Kenyan shilling', 'KSh', 2),
  ('ZAR', 'South African rand', 'R', 2)
on conflict (code) do nothing;

create table if not exists app.country_locales (
  country_code text not null references app.market_countries(iso2) on delete cascade,
  locale_tag text not null,
  language_code text not null,
  text_direction text not null default 'ltr',
  is_default boolean not null default false,
  content_status text not null default 'configured',
  dictionary_version text,
  reviewed_by uuid references private.profiles(user_id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (country_code, locale_tag),
  constraint country_locales_tag_length check (char_length(locale_tag) between 2 and 35),
  constraint country_locales_language check (language_code ~ '^[a-z]{2,3}$'),
  constraint country_locales_direction check (text_direction in ('ltr', 'rtl')),
  constraint country_locales_status check (content_status in ('configured', 'reviewed')),
  constraint country_locales_review_pair check (
    content_status <> 'reviewed' or reviewed_at is not null
  )
);

create unique index if not exists country_locales_one_default
  on app.country_locales (country_code) where is_default;

insert into app.country_locales (
  country_code, locale_tag, language_code, text_direction,
  is_default, content_status, dictionary_version, reviewed_at
) values
  ('NG', 'en-NG', 'en', 'ltr', true, 'reviewed', 'country-pack-v1', timestamptz '2026-07-14 00:00:00+00'),
  ('GH', 'en-GH', 'en', 'ltr', true, 'configured', null, null),
  ('KE', 'en-KE', 'en', 'ltr', true, 'configured', null, null),
  ('ZA', 'en-ZA', 'en', 'ltr', true, 'configured', null, null)
on conflict (country_code, locale_tag) do update
set language_code = excluded.language_code,
    text_direction = excluded.text_direction,
    is_default = excluded.is_default;

create table if not exists app.country_time_zones (
  country_code text not null references app.market_countries(iso2) on delete cascade,
  time_zone_name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (country_code, time_zone_name),
  constraint country_time_zones_name check (char_length(time_zone_name) between 3 and 100)
);

create unique index if not exists country_time_zones_one_default
  on app.country_time_zones (country_code) where is_default;

insert into app.country_time_zones (country_code, time_zone_name, is_default) values
  ('NG', 'Africa/Lagos', true),
  ('GH', 'Africa/Accra', true),
  ('KE', 'Africa/Nairobi', true),
  ('ZA', 'Africa/Johannesburg', true)
on conflict (country_code, time_zone_name) do update
set is_default = excluded.is_default;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'market_countries_default_currency_fkey'
      and conrelid = 'app.market_countries'::regclass
  ) then
    alter table app.market_countries
      add constraint market_countries_default_currency_fkey
      foreign key (default_currency) references app.currencies(code) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'market_countries_default_locale_fkey'
      and conrelid = 'app.market_countries'::regclass
  ) then
    alter table app.market_countries
      add constraint market_countries_default_locale_fkey
      foreign key (iso2, default_locale)
      references app.country_locales(country_code, locale_tag) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'market_countries_default_time_zone_fkey'
      and conrelid = 'app.market_countries'::regclass
  ) then
    alter table app.market_countries
      add constraint market_countries_default_time_zone_fkey
      foreign key (iso2, default_time_zone)
      references app.country_time_zones(country_code, time_zone_name)
      on delete restrict;
  end if;
end;
$$;

create table if not exists app.subdivisions (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references app.market_countries(iso2) on delete restrict,
  code text,
  name text not null,
  subdivision_type text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country_code, name),
  constraint subdivisions_code_length check (code is null or char_length(code) between 2 and 20),
  constraint subdivisions_name_length check (char_length(name) between 2 and 120),
  constraint subdivisions_type_length check (char_length(subdivision_type) between 2 and 40)
);

create unique index if not exists subdivisions_country_code_unique
  on app.subdivisions (country_code, code) where code is not null;

create table if not exists app.cities (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references app.market_countries(iso2) on delete restrict,
  subdivision_id uuid references app.subdivisions(id) on delete restrict,
  slug text not null,
  name text not null,
  time_zone_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country_code, slug),
  constraint cities_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint cities_name_length check (char_length(name) between 2 and 120),
  constraint cities_timezone_length check (
    time_zone_name is null or char_length(time_zone_name) between 3 and 100
  )
);

create index if not exists cities_subdivision on app.cities (subdivision_id);

alter table private.profiles
  add column if not exists subdivision_id uuid references app.subdivisions(id) on delete set null,
  add column if not exists city_id uuid references app.cities(id) on delete set null;

alter table app.company_locations
  add column if not exists subdivision_id uuid references app.subdivisions(id) on delete set null,
  add column if not exists city_id uuid references app.cities(id) on delete set null,
  add column if not exists source_location_text text;

alter table app.job_locations
  add column if not exists subdivision_id uuid references app.subdivisions(id) on delete set null,
  add column if not exists city_id uuid references app.cities(id) on delete set null,
  add column if not exists time_zone_name text,
  add column if not exists source_location_text text,
  add column if not exists is_physical_location boolean not null default true;

alter table app.company_legal_entities
  add column if not exists subdivision_id uuid references app.subdivisions(id) on delete set null,
  add column if not exists city_id uuid references app.cities(id) on delete set null;

alter table private.salary_submissions
  add column if not exists office_id uuid references app.company_locations(id) on delete set null;
alter table private.company_reviews
  add column if not exists office_id uuid references app.company_locations(id) on delete set null;
alter table private.interview_experiences
  add column if not exists office_id uuid references app.company_locations(id) on delete set null;
alter table private.benefit_submissions
  add column if not exists office_id uuid references app.company_locations(id) on delete set null;
alter table private.pay_reliability_submissions
  add column if not exists office_id uuid references app.company_locations(id) on delete set null;
alter table app.review_publications
  add column if not exists office_id uuid references app.company_locations(id) on delete set null;
alter table app.interview_publications
  add column if not exists office_id uuid references app.company_locations(id) on delete set null;
alter table app.salary_aggregate_snapshots
  add column if not exists office_id uuid references app.company_locations(id) on delete set null;
alter table app.company_rating_snapshots
  add column if not exists country_code text,
  add column if not exists office_id uuid references app.company_locations(id) on delete set null;
alter table app.company_benefits
  add column if not exists country_code text,
  add column if not exists office_id uuid references app.company_locations(id) on delete set null;

alter table app.company_rating_snapshots
  drop constraint if exists company_rating_snapshots_country_format;
alter table app.company_rating_snapshots
  add constraint company_rating_snapshots_country_format check (
    country_code is null or country_code ~ '^[A-Z]{2}$'
  );
alter table app.company_benefits
  drop constraint if exists company_benefits_country_format;
alter table app.company_benefits
  add constraint company_benefits_country_format check (
    country_code is null or country_code ~ '^[A-Z]{2}$'
  );

drop index if exists app.salary_aggregate_current_cell;
create unique index salary_aggregate_current_cell
  on app.salary_aggregate_snapshots (
    coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    role_family_id, country_code,
    coalesce(office_id, '00000000-0000-0000-0000-000000000000'::uuid),
    currency_code, gross_net, engagement_type
  ) where is_current;

drop index if exists app.company_rating_current;
create unique index company_rating_current
  on app.company_rating_snapshots (
    company_id, coalesce(country_code, ''),
    coalesce(office_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) where is_current;

create table if not exists app.job_timezone_requirements (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references app.jobs(id) on delete cascade,
  occurrence_id uuid references ingest.job_source_occurrences(id) on delete set null,
  reference_time_zone text not null,
  overlap_window_start time,
  overlap_window_end time,
  minimum_overlap_minutes integer,
  exact_source_evidence text not null,
  last_verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (job_id, occurrence_id),
  constraint job_timezone_name_length check (char_length(reference_time_zone) between 3 and 100),
  constraint job_timezone_overlap_range check (
    minimum_overlap_minutes is null or minimum_overlap_minutes between 0 and 1440
  ),
  constraint job_timezone_evidence_length check (
    char_length(exact_source_evidence) between 1 and 2000
  )
);

create or replace function security.validate_normalized_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.subdivision_id is not null and not exists (
    select 1 from app.subdivisions subdivision
    where subdivision.id = new.subdivision_id
      and subdivision.country_code = new.country_code
  ) then
    raise exception using errcode = '23514',
      message = 'subdivision must belong to the selected country';
  end if;
  if new.city_id is not null and not exists (
    select 1 from app.cities city
    where city.id = new.city_id
      and city.country_code = new.country_code
      and (new.subdivision_id is null or city.subdivision_id = new.subdivision_id)
  ) then
    raise exception using errcode = '23514',
      message = 'city must belong to the selected country and subdivision';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_normalized_location_guard on private.profiles;
create trigger profiles_normalized_location_guard
before insert or update on private.profiles
for each row execute function security.validate_normalized_location();
drop trigger if exists company_locations_normalized_guard on app.company_locations;
create trigger company_locations_normalized_guard
before insert or update on app.company_locations
for each row execute function security.validate_normalized_location();
drop trigger if exists job_locations_normalized_guard on app.job_locations;
create trigger job_locations_normalized_guard
before insert or update on app.job_locations
for each row execute function security.validate_normalized_location();

create table if not exists app.country_statutory_rule_versions (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references app.market_countries(iso2) on delete restrict,
  subdivision_id uuid references app.subdivisions(id) on delete restrict,
  rule_kind app.statutory_rule_kind not null,
  rule_key text not null,
  version integer not null,
  effective_from date not null,
  effective_to date,
  state app.statutory_rule_state not null default 'draft',
  rule_payload jsonb not null default '{}'::jsonb,
  citations jsonb not null default '[]'::jsonb,
  reviewed_by uuid references private.profiles(user_id) on delete set null,
  reviewed_at timestamptz,
  review_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country_code, subdivision_id, rule_kind, rule_key, version),
  constraint statutory_rule_key_format check (rule_key ~ '^[a-z0-9_]{2,100}$'),
  constraint statutory_rule_version_positive check (version > 0),
  constraint statutory_rule_dates check (effective_to is null or effective_to >= effective_from),
  constraint statutory_rule_payload_object check (jsonb_typeof(rule_payload) = 'object'),
  constraint statutory_rule_citations_array check (jsonb_typeof(citations) = 'array'),
  constraint statutory_rule_reviewed_shape check (
    state not in ('reviewed', 'active')
    or (
      reviewed_by is not null and reviewed_at is not null
      and review_due_at > reviewed_at and jsonb_array_length(citations) > 0
    )
  )
);

create unique index if not exists statutory_rule_one_active
  on app.country_statutory_rule_versions (
    country_code, coalesce(subdivision_id, '00000000-0000-0000-0000-000000000000'::uuid),
    rule_kind, rule_key
  ) where state = 'active';
create unique index if not exists statutory_rule_version_scope_unique
  on app.country_statutory_rule_versions (
    country_code,
    coalesce(subdivision_id, '00000000-0000-0000-0000-000000000000'::uuid),
    rule_kind, rule_key, version
  );

create table if not exists app.country_facts (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references app.market_countries(iso2) on delete cascade,
  subdivision_id uuid references app.subdivisions(id) on delete set null,
  locale_tag text not null,
  page_key text not null,
  fact_key text not null,
  fact_value jsonb not null,
  source_url text not null,
  source_title text not null,
  retrieved_at timestamptz not null,
  reviewed_by uuid references private.profiles(user_id) on delete set null,
  reviewed_at timestamptz not null,
  review_due_at timestamptz not null,
  status text not null default 'current',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country_code, locale_tag, page_key, fact_key, source_url),
  constraint country_facts_locale_length check (char_length(locale_tag) between 2 and 35),
  constraint country_facts_page_key check (page_key ~ '^[a-z0-9]+(?:[-_/][a-z0-9]+)*$'),
  constraint country_facts_fact_key check (fact_key ~ '^[a-z0-9_]{2,100}$'),
  constraint country_facts_value_object check (jsonb_typeof(fact_value) = 'object'),
  constraint country_facts_source_https check (source_url ~* '^https://'),
  constraint country_facts_status check (status in ('current', 'review_due', 'superseded', 'withdrawn')),
  constraint country_facts_review_order check (review_due_at > reviewed_at)
);

create index if not exists country_facts_readiness
  on app.country_facts (country_code, locale_tag, status, review_due_at);

create table if not exists app.source_country_rights (
  source_id uuid not null references app.job_sources(id) on delete cascade,
  country_code text not null references app.market_countries(iso2) on delete cascade,
  policy_state app.source_policy_state not null default 'draft',
  permission_basis text,
  evidence_reference text,
  terms_url text,
  reviewed_at timestamptz,
  review_due_at timestamptz,
  allowed_fields text[] not null default '{}'::text[],
  may_store_full_description boolean not null default false,
  attribution_required boolean not null default true,
  attribution_text text,
  minimum_poll_interval interval,
  retention_period interval not null default interval '0 days',
  allow_public_display boolean not null default false,
  allow_search_index boolean not null default false,
  allow_google_jobposting boolean not null default false,
  missing_dependencies text[] not null default '{}'::text[],
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_id, country_code),
  constraint source_country_rights_terms check (
    terms_url is null or terms_url = '/terms' or terms_url ~* '^https://'
  ),
  constraint source_country_rights_review_order check (
    review_due_at is null or reviewed_at is null or review_due_at > reviewed_at
  ),
  constraint source_country_rights_poll check (
    minimum_poll_interval is null or minimum_poll_interval >= interval '15 minutes'
  ),
  constraint source_country_rights_retention check (
    retention_period between interval '0 days' and interval '10 years'
  ),
  constraint source_country_rights_enabled_shape check (
    policy_state <> 'enabled'
    or (
      permission_basis is not null and evidence_reference is not null
      and terms_url is not null and reviewed_at is not null
      and review_due_at is not null and cardinality(allowed_fields) > 0
      and revoked_at is null and missing_dependencies = '{}'::text[]
    )
  ),
  constraint source_country_rights_index_shape check (
    not allow_search_index or allow_public_display
  ),
  constraint source_country_rights_schema_shape check (
    not allow_google_jobposting or allow_search_index
  )
);

create or replace function security.enforce_source_country_rights_subset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source app.job_sources%rowtype;
begin
  select * into v_source from app.job_sources where id = new.source_id;
  if v_source.id is null
     or not (new.allowed_fields <@ v_source.allowed_fields)
     or (new.may_store_full_description and not v_source.may_store_full_description)
     or (new.allow_public_display and not v_source.allow_public_listing)
     or (new.allow_search_index and not v_source.may_index_jobs)
     or (new.allow_google_jobposting and not v_source.may_emit_jobposting_schema)
     or new.retention_period > v_source.raw_retention
     or (
       v_source.minimum_poll_interval is not null
       and (
         new.minimum_poll_interval is null
         or new.minimum_poll_interval < v_source.minimum_poll_interval
       )
     ) then
    raise exception using errcode = '42501',
      message = 'country rights cannot exceed the reviewed global source policy';
  end if;
  return new;
end;
$$;

drop trigger if exists source_country_rights_subset_guard on app.source_country_rights;
create trigger source_country_rights_subset_guard
before insert or update on app.source_country_rights
for each row execute function security.enforce_source_country_rights_subset();

insert into app.source_country_rights (
  source_id, country_code, policy_state, permission_basis,
  evidence_reference, terms_url, reviewed_at, review_due_at, allowed_fields,
  may_store_full_description, attribution_required, attribution_text,
  minimum_poll_interval, retention_period, allow_public_display,
  allow_search_index, allow_google_jobposting, missing_dependencies
)
select source.id, 'NG', 'enabled'::app.source_policy_state,
  source.authorization_basis, source.authorization_evidence_ref,
  source.terms_url, source.authorization_reviewed_at,
  source.policy_review_due_at, source.allowed_fields,
  source.may_store_full_description, source.attribution_required,
  source.attribution_text, source.minimum_poll_interval,
  source.raw_retention, source.allow_public_listing,
  source.may_index_jobs, source.may_emit_jobposting_schema,
  source.missing_dependencies
from app.job_sources source
where source.adapter_key = 'salarypadi_employer_submissions'
  and source.authorization_basis is not null
  and source.authorization_evidence_ref is not null
  and source.authorization_reviewed_at is not null
  and source.policy_review_due_at is not null
  and source.allowed_fields <> '{}'::text[]
on conflict (source_id, country_code) do nothing;

create table if not exists private.country_pack_gate_reviews (
  country_code text not null references app.market_countries(iso2) on delete cascade,
  gate_key text not null,
  state app.country_pack_review_state not null default 'pending',
  evidence_reference text,
  notes text,
  reviewed_by uuid references private.profiles(user_id) on delete set null,
  reviewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (country_code, gate_key),
  constraint country_pack_gate_key check (gate_key in (
    'local_eligibility_accuracy', 'localized_content_quality',
    'moderation_privacy_takedown', 'seo_canonical_hreflang'
  )),
  constraint country_pack_gate_evidence check (
    state <> 'passed'
    or (
      evidence_reference is not null and reviewed_by is not null
      and reviewed_at is not null and expires_at > reviewed_at
    )
  )
);

create or replace function security.job_explicitly_allows_country(
  p_job_id uuid,
  p_country_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.job_eligibility eligibility
    where eligibility.job_id = p_job_id
      and not exists (
        select 1 from app.job_eligibility_countries excluded
        where excluded.job_id = p_job_id
          and excluded.country_code = upper(p_country_code)
          and excluded.rule = 'exclude'
      )
      and (
        exists (
          select 1 from app.job_eligibility_countries included
          where included.job_id = p_job_id
            and included.country_code = upper(p_country_code)
            and included.rule = 'include'
        )
        or eligibility.scope = 'worldwide'
        or (
          eligibility.scope = 'africa'
          and exists (
            select 1 from app.market_countries country
            where country.iso2 = upper(p_country_code)
              and country.region_code = 'africa'
          )
        )
        or (eligibility.scope = 'nigeria' and upper(p_country_code) = 'NG')
      )
  );
$$;

comment on function security.job_explicitly_allows_country(uuid,text) is
  'Requires explicit country, worldwide, Africa, or Nigeria evidence. EMEA and generic remote never imply African-country eligibility.';

create or replace function security.job_source_country_policy_is_runnable(
  p_source_id uuid,
  p_country_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select security.job_source_policy_is_runnable(p_source_id)
    and exists (
      select 1
      from app.source_country_rights rights
      where rights.source_id = p_source_id
        and rights.country_code = upper(p_country_code)
        and rights.policy_state = 'enabled'
        and rights.permission_basis is not null
        and rights.evidence_reference is not null
        and rights.terms_url is not null
        and rights.reviewed_at is not null
        and rights.review_due_at > statement_timestamp()
        and rights.allowed_fields <> '{}'::text[]
        and rights.revoked_at is null
        and rights.missing_dependencies = '{}'::text[]
    );
$$;

create or replace function security.country_pack_accepts_public_jobs(
  p_country_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app.market_countries country
    where country.iso2 = upper(p_country_code)
      and country.is_supported
      and country.public_routes_enabled
      and country.pack_state in ('launch', 'active')
  );
$$;

create or replace function security.job_country_distribution_allowed(
  p_job_id uuid,
  p_capability text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_capability in ('public', 'index', 'jobposting') and exists (
    select 1
    from app.jobs job
    join app.market_countries country
      on country.public_routes_enabled
     and country.pack_state in ('launch', 'active')
    join app.source_country_rights rights
      on rights.source_id = job.source_id
     and rights.country_code = country.iso2
    where job.id = p_job_id
      and security.job_source_country_policy_is_runnable(
        rights.source_id, rights.country_code
      )
      and (
        exists (
          select 1 from app.job_locations location
          where location.job_id = job.id
            and location.country_code = country.iso2
        )
        or security.job_explicitly_allows_country(job.id, country.iso2)
      )
      and case p_capability
        when 'public' then rights.allow_public_display
        when 'index' then rights.allow_public_display and rights.allow_search_index
        when 'jobposting' then rights.allow_public_display
          and rights.allow_search_index and rights.allow_google_jobposting
        else false
      end
  );
$$;

create or replace function security.enforce_public_job_country_pack()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid := new.job_id;
  v_country_code text := new.country_code;
  v_job_status app.job_status;
  v_source_id uuid;
begin
  if v_country_code is null then return new; end if;
  if tg_table_name = 'job_eligibility_countries'
     and coalesce(to_jsonb(new)->>'rule', '') <> 'include' then
    return new;
  end if;
  select job.status, job.source_id into v_job_status, v_source_id
  from app.jobs job where job.id = v_job_id;
  if v_job_status = 'published'
     and exists (select 1 from app.market_countries country where country.iso2 = v_country_code)
     and not security.country_pack_accepts_public_jobs(v_country_code) then
    raise exception using errcode = '42501',
      message = 'country pack is not activated for public jobs';
  end if;
  if v_job_status = 'published'
     and security.country_pack_accepts_public_jobs(v_country_code)
     and not exists (
       select 1 from app.source_country_rights rights
       where rights.source_id = v_source_id
         and rights.country_code = v_country_code
         and rights.allow_public_display
         and security.job_source_country_policy_is_runnable(
           rights.source_id, rights.country_code
         )
     ) then
    raise exception using errcode = '42501',
      message = 'source lacks public-display rights for this country';
  end if;
  return new;
end;
$$;

drop trigger if exists job_locations_country_pack_guard on app.job_locations;
create trigger job_locations_country_pack_guard
before insert or update on app.job_locations
for each row execute function security.enforce_public_job_country_pack();

drop trigger if exists job_eligibility_countries_pack_guard on app.job_eligibility_countries;
create trigger job_eligibility_countries_pack_guard
before insert or update on app.job_eligibility_countries
for each row execute function security.enforce_public_job_country_pack();

create or replace function security.validate_contribution_office()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.office_id is null then return new; end if;
  if not exists (
    select 1 from app.company_locations office
    where office.id = new.office_id
      and office.country_code = new.country_code
      and (new.company_id is null or office.company_id = new.company_id)
  ) then
    raise exception using errcode = '23514',
      message = 'office must belong to the selected company and country';
  end if;
  return new;
end;
$$;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'salary_submissions', 'company_reviews', 'interview_experiences',
    'benefit_submissions', 'pay_reliability_submissions'
  ] loop
    execute format('drop trigger if exists %I on private.%I',
      relation_name || '_office_guard', relation_name);
    execute format('create trigger %I before insert or update on private.%I '
      || 'for each row execute function security.validate_contribution_office()',
      relation_name || '_office_guard', relation_name);
  end loop;
  foreach relation_name in array array['review_publications', 'interview_publications'] loop
    execute format('drop trigger if exists %I on app.%I',
      relation_name || '_office_guard', relation_name);
    execute format('create trigger %I before insert or update on app.%I '
      || 'for each row execute function security.validate_contribution_office()',
      relation_name || '_office_guard', relation_name);
  end loop;
end;
$$;

create or replace function api.worker_get_source_country_rights(p_source_id uuid)
returns table (country_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select rights.country_code
  from app.source_country_rights rights
  where rights.source_id = p_source_id
    and security.job_source_country_policy_is_runnable(
      rights.source_id, rights.country_code
    )
    and exists (
      select 1 from app.market_countries country
      where country.iso2 = rights.country_code
        and country.public_routes_enabled
        and country.pack_state in ('launch', 'active')
    )
  order by rights.country_code;
$$;

revoke all on function api.worker_get_source_country_rights(uuid)
from public, anon, authenticated;
grant execute on function api.worker_get_source_country_rights(uuid)
to service_role;

create or replace function security.enforce_fetch_country_rights()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from app.source_country_rights rights
    join app.market_countries country on country.iso2 = rights.country_code
    where rights.source_id = new.source_id
      and country.public_routes_enabled
      and country.pack_state in ('launch', 'active')
      and security.job_source_country_policy_is_runnable(
        rights.source_id, rights.country_code
      )
  ) then
    raise exception using errcode = '42501',
      message = 'source has no runnable rights for an active country pack';
  end if;
  return new;
end;
$$;

drop trigger if exists source_fetch_claims_country_rights_guard
  on private.source_fetch_claims;
create trigger source_fetch_claims_country_rights_guard
before insert on private.source_fetch_claims
for each row execute function security.enforce_fetch_country_rights();

create or replace function security.public_job_provenance(p_job_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'source_adapter_key', source.adapter_key,
    'external_source_id', job.external_source_id,
    'canonical_job_id', job.id,
    'lifecycle_state', job.lifecycle_state,
    'lifecycle_reason', coalesce(job.lifecycle_reason, 'source_observed_open'),
    'why_still_open', case when job.valid_through is null
      then 'current source occurrence and no authoritative closure evidence'
      else 'source deadline has not elapsed' end,
    'last_seen_at', job.last_seen_at,
    'last_checked_at', job.last_checked_at,
    'last_verified_at', coalesce(job.last_verified_at, job.last_seen_at),
    'verification_basis', case when job.last_verified_at is null
      then 'source_occurrence_seen' else 'source_verified' end,
    'source_policy_review_due_at', source.policy_review_due_at,
    'public_display_permitted',
      security.job_country_distribution_allowed(job.id, 'public'),
    'search_index_permitted',
      security.job_country_distribution_allowed(job.id, 'index'),
    'google_jobposting_permitted',
      security.job_country_distribution_allowed(job.id, 'jobposting'),
    'country_rights', coalesce((
      select jsonb_agg(jsonb_build_object(
        'country_code', rights.country_code,
        'review_due_at', rights.review_due_at,
        'public_display', rights.allow_public_display,
        'search_index', rights.allow_search_index,
        'google_jobposting', rights.allow_google_jobposting
      ) order by rights.country_code)
      from app.source_country_rights rights
      join app.market_countries country on country.iso2 = rights.country_code
      where rights.source_id = job.source_id
        and country.public_routes_enabled
        and security.job_source_country_policy_is_runnable(
          rights.source_id, rights.country_code
        )
    ), '[]'::jsonb),
    'occurrence_count', (
      select count(*) from ingest.job_occurrence_links link
      where link.canonical_job_id = job.id
    ),
    'latest_occurrence_at', (
      select max(occurrence.observed_at)
      from ingest.job_occurrence_links link
      join ingest.job_source_occurrences occurrence
        on occurrence.id = link.occurrence_id
      where link.canonical_job_id = job.id
    )
  )
  from app.jobs job
  join app.job_sources source on source.id = job.source_id
  where job.id = p_job_id
    and job.status = 'published'
    and job.lifecycle_state <> 'closed'
    and job.canonical_job_id is null
    and not job.is_fixture
    and (job.valid_through is null or job.valid_through > statement_timestamp())
    and security.job_country_distribution_allowed(job.id, 'public')
    and exists (
      select 1 from ingest.job_occurrence_links link
      where link.canonical_job_id = job.id
    );
$$;

revoke all on function security.public_job_provenance(uuid)
from public, anon, authenticated, service_role;
grant execute on function security.public_job_provenance(uuid)
to anon, authenticated;

drop policy if exists jobs_public_read on app.jobs;
create policy jobs_public_read on app.jobs
for select to anon, authenticated using (
  status = 'published'
  and lifecycle_state <> 'closed'
  and canonical_job_id is null
  and not is_fixture
  and (valid_through is null or valid_through > clock_timestamp())
  and (select security.job_country_distribution_allowed(id, 'public'))
  and (select security.public_job_provenance(id)) is not null
);

create or replace function security.google_indexing_job_is_eligible(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.jobs job
    join app.companies company on company.id = job.company_id
    where job.id = p_job_id
      and job.status = 'published'
      and job.lifecycle_state <> 'closed'
      and job.canonical_job_id is null
      and not job.is_fixture
      and (job.valid_through is null or job.valid_through > statement_timestamp())
      and company.record_status = 'published'
      and security.google_indexing_source_is_eligible(job.source_id)
      and security.job_country_distribution_allowed(job.id, 'jobposting')
      and security.public_job_provenance(job.id) is not null
  );
$$;

revoke all on function security.google_indexing_job_is_eligible(uuid)
from public, anon, authenticated, service_role;

create or replace function security.country_pack_readiness_metrics(
  p_country_code text
)
returns table (
  authorized_active_jobs integer,
  authorized_sources integer,
  explicit_eligibility_ratio numeric,
  unique_content_pages integer,
  first_party_contributions integer,
  reviewed_tax_rules integer,
  reviewed_employment_rules integer,
  local_eligibility_reviewed boolean,
  localized_content_reviewed boolean,
  moderation_privacy_takedown_reviewed boolean,
  seo_canonical_hreflang_reviewed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_country text := upper(p_country_code);
  v_supply integer;
  v_accurate integer;
begin
  select count(distinct job.id)::integer,
         count(distinct job.source_id)::integer
  into authorized_active_jobs, authorized_sources
  from app.jobs job
  where job.status = 'published'
    and job.lifecycle_state <> 'closed'
    and job.canonical_job_id is null
    and not job.is_fixture
    and (job.valid_through is null or job.valid_through > statement_timestamp())
    and security.job_source_country_policy_is_runnable(job.source_id, v_country)
    and (
      exists (
        select 1 from app.job_locations location
        where location.job_id = job.id and location.country_code = v_country
      )
      or security.job_explicitly_allows_country(job.id, v_country)
    );

  v_supply := coalesce(authorized_active_jobs, 0);
  select count(distinct job.id)::integer into v_accurate
  from app.jobs job
  where job.status = 'published'
    and job.lifecycle_state <> 'closed'
    and job.canonical_job_id is null
    and not job.is_fixture
    and security.job_source_country_policy_is_runnable(job.source_id, v_country)
    and (
      exists (
        select 1 from app.job_locations location
        where location.job_id = job.id and location.country_code = v_country
          and location.source_location_text is not null
      )
      or exists (
        select 1 from app.job_eligibility eligibility
        where eligibility.job_id = job.id
          and eligibility.evidence_text is not null
          and eligibility.last_verified_at is not null
          and security.job_explicitly_allows_country(job.id, v_country)
      )
    );
  explicit_eligibility_ratio := case when v_supply = 0 then 0
    else coalesce(v_accurate, 0)::numeric / v_supply::numeric end;

  select count(distinct fact.page_key)::integer into unique_content_pages
  from app.country_facts fact
  where fact.country_code = v_country and fact.status = 'current'
    and fact.review_due_at > statement_timestamp();

  select count(distinct first_party.contribution_id)::integer
  into first_party_contributions
  from (
    select salary.contribution_id from private.salary_submissions salary
      join private.contributions contribution
        on contribution.id = salary.contribution_id and contribution.state = 'approved'
      where salary.country_code = v_country
    union all
    select review.source_contribution_id from app.review_publications review
      where review.country_code = v_country and review.publication_status = 'published'
    union all
    select interview.source_contribution_id from app.interview_publications interview
      where interview.country_code = v_country and interview.publication_status = 'published'
    union all
    select benefit.contribution_id from private.benefit_submissions benefit
      join private.contributions contribution
        on contribution.id = benefit.contribution_id and contribution.state = 'approved'
      where benefit.country_code = v_country
    union all
    select reliability.contribution_id from private.pay_reliability_submissions reliability
      join private.contributions contribution
        on contribution.id = reliability.contribution_id and contribution.state = 'approved'
      where reliability.country_code = v_country
  ) first_party;

  select count(*) filter (where rule.rule_kind = 'tax')::integer,
         count(*) filter (where rule.rule_kind = 'employment')::integer
  into reviewed_tax_rules, reviewed_employment_rules
  from app.country_statutory_rule_versions rule
  where rule.country_code = v_country and rule.state = 'active'
    and rule.review_due_at > statement_timestamp();

  select
    coalesce(bool_or(review.gate_key = 'local_eligibility_accuracy'), false),
    coalesce(bool_or(review.gate_key = 'localized_content_quality'), false),
    coalesce(bool_or(review.gate_key = 'moderation_privacy_takedown'), false),
    coalesce(bool_or(review.gate_key = 'seo_canonical_hreflang'), false)
  into local_eligibility_reviewed, localized_content_reviewed,
       moderation_privacy_takedown_reviewed, seo_canonical_hreflang_reviewed
  from private.country_pack_gate_reviews review
  where review.country_code = v_country and review.state = 'passed'
    and review.expires_at > statement_timestamp();

  authorized_active_jobs := coalesce(authorized_active_jobs, 0);
  authorized_sources := coalesce(authorized_sources, 0);
  unique_content_pages := coalesce(unique_content_pages, 0);
  first_party_contributions := coalesce(first_party_contributions, 0);
  reviewed_tax_rules := coalesce(reviewed_tax_rules, 0);
  reviewed_employment_rules := coalesce(reviewed_employment_rules, 0);
  return next;
end;
$$;

create or replace function security.country_pack_gate_failures(
  p_country_code text,
  p_min_jobs integer,
  p_min_sources integer,
  p_min_eligibility_ratio numeric,
  p_min_content integer,
  p_min_first_party integer
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  metric record;
  blockers text[] := '{}'::text[];
begin
  select * into metric
  from security.country_pack_readiness_metrics(p_country_code);
  if metric.authorized_active_jobs < p_min_jobs then
    blockers := array_append(blockers, 'authorized_job_supply');
  end if;
  if metric.authorized_sources < p_min_sources then
    blockers := array_append(blockers, 'source_diversity');
  end if;
  if metric.explicit_eligibility_ratio < p_min_eligibility_ratio
     or not metric.local_eligibility_reviewed then
    blockers := array_append(blockers, 'local_eligibility_accuracy');
  end if;
  if metric.reviewed_tax_rules < 1 or metric.reviewed_employment_rules < 1 then
    blockers := array_append(blockers, 'reviewed_statutory_rules');
  end if;
  if metric.unique_content_pages < p_min_content
     or not metric.localized_content_reviewed then
    blockers := array_append(blockers, 'unique_localized_content');
  end if;
  if metric.first_party_contributions < p_min_first_party then
    blockers := array_append(blockers, 'first_party_data');
  end if;
  if not metric.moderation_privacy_takedown_reviewed then
    blockers := array_append(blockers, 'moderation_privacy_takedown');
  end if;
  if not metric.seo_canonical_hreflang_reviewed then
    blockers := array_append(blockers, 'seo_canonical_hreflang');
  end if;
  return blockers;
end;
$$;

create or replace function security.enforce_country_pack_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  blockers text[];
begin
  if new.search_index_enabled and not new.public_routes_enabled then
    raise exception using errcode = '23514',
      message = 'country indexing requires public routes';
  end if;
  if (new.public_routes_enabled or new.search_index_enabled)
     and new.pack_state not in ('launch', 'active') then
    raise exception using errcode = '23514',
      message = 'candidate or suspended country packs cannot be public';
  end if;
  if (
    (new.public_routes_enabled and not old.public_routes_enabled)
    or (new.search_index_enabled and not old.search_index_enabled)
    or (new.pack_state = 'active' and old.pack_state <> 'active')
  ) then
    if not new.is_supported
       or new.activation_reviewed_by is null
       or new.activation_reviewed_at is null then
      raise exception using errcode = '42501',
        message = 'reviewed activation evidence is required';
    end if;
    if not exists (
      select 1 from app.country_locales locale
      where locale.country_code = new.iso2
        and locale.locale_tag = new.default_locale
        and locale.is_default and locale.content_status = 'reviewed'
    ) then
      raise exception using errcode = '42501',
        message = 'reviewed default-locale content is required';
    end if;
    blockers := security.country_pack_gate_failures(
      new.iso2, new.min_authorized_active_jobs, new.min_authorized_sources,
      new.min_explicit_eligibility_ratio, new.min_unique_content_pages,
      new.min_first_party_contributions
    );
    if cardinality(blockers) > 0 then
      raise exception using errcode = '42501',
        message = 'country pack activation gates are not satisfied',
        detail = array_to_string(blockers, ',');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists market_countries_activation_guard on app.market_countries;
create trigger market_countries_activation_guard
before update on app.market_countries
for each row execute function security.enforce_country_pack_activation();

create or replace function api.admin_get_country_pack_readiness()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select security.has_staff_role('admin'))
     or not (select security.is_aal2()) then
    raise exception using errcode = '42501',
      message = 'admin role and AAL2 required';
  end if;
  return jsonb_build_object(
    'generated_at', clock_timestamp(),
    'countries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'country_code', country.iso2,
        'name', country.name,
        'pack_state', country.pack_state,
        'route_prefix', country.route_prefix,
        'default_locale', country.default_locale,
        'currency_code', country.default_currency,
        'time_zone', country.default_time_zone,
        'public_routes_enabled', country.public_routes_enabled,
        'search_index_enabled', country.search_index_enabled,
        'activation_ready', cardinality(failures.blockers) = 0,
        'blockers', to_jsonb(failures.blockers),
        'metrics', jsonb_build_object(
          'authorized_active_jobs', metric.authorized_active_jobs,
          'authorized_sources', metric.authorized_sources,
          'explicit_eligibility_ratio', metric.explicit_eligibility_ratio,
          'unique_content_pages', metric.unique_content_pages,
          'first_party_contributions', metric.first_party_contributions,
          'reviewed_tax_rules', metric.reviewed_tax_rules,
          'reviewed_employment_rules', metric.reviewed_employment_rules
        ),
        'thresholds', jsonb_build_object(
          'authorized_active_jobs', country.min_authorized_active_jobs,
          'authorized_sources', country.min_authorized_sources,
          'explicit_eligibility_ratio', country.min_explicit_eligibility_ratio,
          'unique_content_pages', country.min_unique_content_pages,
          'first_party_contributions', country.min_first_party_contributions
        )
      ) order by country.is_launch_market desc, country.name)
      from app.market_countries country
      cross join lateral security.country_pack_readiness_metrics(country.iso2) metric
      cross join lateral (
        select security.country_pack_gate_failures(
          country.iso2, country.min_authorized_active_jobs,
          country.min_authorized_sources, country.min_explicit_eligibility_ratio,
          country.min_unique_content_pages,
          country.min_first_party_contributions
        ) as blockers
      ) failures
      where country.iso2 in ('NG', 'GH', 'KE', 'ZA')
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function api.admin_get_country_pack_readiness()
from public, anon;
grant execute on function api.admin_get_country_pack_readiness()
to authenticated;

revoke all on function security.job_explicitly_allows_country(uuid,text)
from public, anon, authenticated, service_role;
revoke all on function security.job_source_country_policy_is_runnable(uuid,text)
from public, anon, authenticated;
grant execute on function security.job_source_country_policy_is_runnable(uuid,text)
to service_role;
revoke all on function security.job_country_distribution_allowed(uuid,text)
from public, anon, authenticated, service_role;
grant execute on function security.job_country_distribution_allowed(uuid,text)
to anon, authenticated;
revoke all on function security.country_pack_accepts_public_jobs(text)
from public, anon, authenticated, service_role;
revoke all on function security.country_pack_readiness_metrics(text)
from public, anon, authenticated, service_role;
revoke all on function security.country_pack_gate_failures(text,integer,integer,numeric,integer,integer)
from public, anon, authenticated, service_role;
revoke all on function security.enforce_public_job_country_pack()
from public, anon, authenticated, service_role;
revoke all on function security.enforce_fetch_country_rights()
from public, anon, authenticated, service_role;
revoke all on function security.validate_normalized_location()
from public, anon, authenticated, service_role;
revoke all on function security.validate_contribution_office()
from public, anon, authenticated, service_role;
revoke all on function security.enforce_source_country_rights_subset()
from public, anon, authenticated, service_role;

alter table app.currencies enable row level security;
alter table app.currencies force row level security;
alter table app.country_locales enable row level security;
alter table app.country_locales force row level security;
alter table app.country_time_zones enable row level security;
alter table app.country_time_zones force row level security;
alter table app.subdivisions enable row level security;
alter table app.subdivisions force row level security;
alter table app.cities enable row level security;
alter table app.cities force row level security;
alter table app.job_timezone_requirements enable row level security;
alter table app.job_timezone_requirements force row level security;
alter table app.country_statutory_rule_versions enable row level security;
alter table app.country_statutory_rule_versions force row level security;
alter table app.country_facts enable row level security;
alter table app.country_facts force row level security;
alter table app.source_country_rights enable row level security;
alter table app.source_country_rights force row level security;
alter table private.country_pack_gate_reviews enable row level security;
alter table private.country_pack_gate_reviews force row level security;

revoke all on app.currencies, app.country_locales, app.country_time_zones,
  app.subdivisions, app.cities, app.job_timezone_requirements,
  app.country_statutory_rule_versions, app.country_facts,
  app.source_country_rights, private.country_pack_gate_reviews
from public, anon, authenticated;

comment on table app.source_country_rights is
  'Country-scoped source authorization. Missing, disabled, expired, revoked, or incomplete rows stop acquisition and publication for that country.';
comment on table app.country_statutory_rule_versions is
  'Versioned reviewed statutory evidence; no tax or employment fact is activated without citations and a review window.';
comment on table private.country_pack_gate_reviews is
  'Human evidence for qualitative country activation gates. It is not public content.';
comment on table app.job_timezone_requirements is
  'Normalized timezone overlap plus the exact source wording used as evidence.';

revoke all on function security.enforce_country_pack_activation() from public, anon, authenticated, service_role;

-- Final privilege invariant for every internal security-definer routine,
-- including functions introduced by earlier migrations in this release.
do $$
declare routine record;
begin
  for routine in
    select procedure.oid::regprocedure as signature
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('security', 'audit')
      and procedure.prosecdef
  loop
    execute format('revoke all on function %s from public', routine.signature);
  end loop;
end;
$$;

commit;
