import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const manifestPath = fileURLToPath(
  new URL("../data/companies/africa-major-companies.v1.json", import.meta.url),
);
const migrationPath = fileURLToPath(
  new URL(
    "../supabase/migrations/20260714100000_african_company_catalog.sql",
    import.meta.url,
  ),
);
const expectedCount = 100;
const allowedRegions = new Set([
  "north_africa",
  "east_africa",
  "west_africa",
  "central_africa",
  "southern_africa",
]);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const domainPattern =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

function fail(message) {
  throw new Error(`African company catalog invalid: ${message}`);
}

function assertString(value, label, { min = 1, max = 300 } = {}) {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length < min ||
    value.length > max
  ) {
    fail(`${label} must be a trimmed string between ${min} and ${max} chars`);
  }
}

function parseHttpsUrl(value, label) {
  assertString(value, label, { min: 9, max: 500 });
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} must be a valid URL`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    fail(`${label} must be a credential-free HTTPS URL without query or hash`);
  }
  return url;
}

function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object") fail("root must be an object");
  assertString(manifest.catalogVersion, "catalogVersion", { max: 40 });
  const generatedAt = new Date(manifest.generatedAt);
  const reviewDueAt = new Date(manifest.reviewDueAt);
  if (!Number.isFinite(generatedAt.valueOf()))
    fail("generatedAt must be ISO date-time");
  if (!Number.isFinite(reviewDueAt.valueOf()) || reviewDueAt <= generatedAt) {
    fail("reviewDueAt must be later than generatedAt");
  }
  if (
    !manifest.selectionSource ||
    typeof manifest.selectionSource !== "object"
  ) {
    fail("selectionSource is required");
  }
  assertString(manifest.selectionSource.title, "selectionSource.title");
  parseHttpsUrl(manifest.selectionSource.url, "selectionSource.url");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.selectionSource.dataAsOf)) {
    fail("selectionSource.dataAsOf must use YYYY-MM-DD");
  }
  assertString(
    manifest.selectionSource.methodology,
    "selectionSource.methodology",
    {
      min: 20,
      max: 500,
    },
  );
  if (
    !Array.isArray(manifest.companies) ||
    manifest.companies.length !== expectedCount
  ) {
    fail(`companies must contain exactly ${expectedCount} rows`);
  }

  const slugs = new Set();
  const domains = new Set();
  const ranks = new Set();
  const countries = new Set();
  const regions = new Set();

  for (const [index, company] of manifest.companies.entries()) {
    const label = `companies[${index}]`;
    if (!company || typeof company !== "object")
      fail(`${label} must be an object`);
    if (
      !Number.isInteger(company.rank) ||
      company.rank < 1 ||
      company.rank > expectedCount
    ) {
      fail(`${label}.rank must be an integer from 1 to ${expectedCount}`);
    }
    if (ranks.has(company.rank)) fail(`duplicate rank ${company.rank}`);
    ranks.add(company.rank);
    assertString(company.slug, `${label}.slug`, { min: 2, max: 100 });
    if (!slugPattern.test(company.slug))
      fail(`${label}.slug has invalid format`);
    if (slugs.has(company.slug)) fail(`duplicate slug ${company.slug}`);
    slugs.add(company.slug);
    assertString(company.name, `${label}.name`, { min: 2, max: 200 });
    assertString(company.sector, `${label}.sector`, { min: 2, max: 160 });
    if (!/^[A-Z]{2}$/.test(company.marketCountryCode)) {
      fail(`${label}.marketCountryCode must be ISO alpha-2 format`);
    }
    assertString(company.marketCountry, `${label}.marketCountry`, {
      min: 2,
      max: 100,
    });
    if (!allowedRegions.has(company.region))
      fail(`${label}.region is unsupported`);
    assertString(company.domain, `${label}.domain`, { min: 4, max: 253 });
    if (!domainPattern.test(company.domain))
      fail(`${label}.domain has invalid format`);
    if (domains.has(company.domain)) fail(`duplicate domain ${company.domain}`);
    domains.add(company.domain);
    const website = parseHttpsUrl(company.website, `${label}.website`);
    const source = parseHttpsUrl(
      company.officialSourceUrl,
      `${label}.officialSourceUrl`,
    );
    if (normalizeHostname(website.hostname) !== company.domain) {
      fail(`${label}.website hostname must match domain`);
    }
    if (
      normalizeHostname(source.hostname) !== company.domain &&
      !normalizeHostname(source.hostname).endsWith(`.${company.domain}`)
    ) {
      fail(`${label}.officialSourceUrl must remain on the official domain`);
    }
    assertString(company.officialSourceTitle, `${label}.officialSourceTitle`, {
      min: 2,
      max: 300,
    });
    countries.add(company.marketCountryCode);
    regions.add(company.region);
  }

  for (let rank = 1; rank <= expectedCount; rank += 1) {
    if (!ranks.has(rank)) fail(`rank ${rank} is missing`);
  }
  if (countries.size < 10)
    fail("catalog must cover at least 10 African markets");
  if (regions.size < 4)
    fail("catalog must cover at least four African regions");
  return { countries, regions };
}

function buildMigration(manifest) {
  const values = manifest.companies
    .map(
      (company) =>
        `  (${[
          company.rank,
          sqlLiteral(company.slug),
          sqlLiteral(company.name),
          sqlLiteral(company.website),
          sqlLiteral(company.domain),
          sqlLiteral(company.sector),
          sqlLiteral(company.marketCountryCode),
          sqlLiteral(company.marketCountry),
          sqlLiteral(company.region),
          sqlLiteral(company.officialSourceUrl),
          sqlLiteral(company.officialSourceTitle),
        ].join(", ")})`,
    )
    .join(",\n");

  return `-- Generated by scripts/build-african-company-catalog.mjs. Do not hand edit.
-- Selection provenance: ${manifest.selectionSource.title}, data as of ${manifest.selectionSource.dataAsOf}.
-- This publishes factual source-listed shells only. It does not confer employer verification.
begin;

create temporary table african_company_catalog (
  ranking integer not null,
  slug text not null,
  display_name text not null,
  website_url text not null,
  website_domain text not null,
  industry text not null,
  market_country_code text not null,
  market_country text not null,
  market_region text not null,
  source_url text not null,
  source_title text not null
) on commit drop;

insert into african_company_catalog (
  ranking, slug, display_name, website_url, website_domain, industry,
  market_country_code, market_country, market_region, source_url, source_title
)
values
${values};

do $$
declare
  collision record;
begin
  select catalog.slug as incoming_slug, existing.slug as existing_slug,
         catalog.website_domain
  into collision
  from african_company_catalog catalog
  join app.companies existing
    on existing.website_domain = catalog.website_domain
   and existing.slug <> catalog.slug
  limit 1;

  if found then
    raise exception 'African company catalog domain collision: % belongs to existing slug %, incoming slug %',
      collision.website_domain, collision.existing_slug, collision.incoming_slug;
  end if;
end;
$$;

insert into app.companies (
  slug, display_name, website_url, website_domain, industry,
  verification_status, verification_scope, record_status
)
select
  slug, display_name, website_url, website_domain, industry,
  'unverified',
  'Official website and domain are source-listed; employer identity is not verified',
  'published'
from african_company_catalog
on conflict (slug) do update
set display_name = case
      when app.companies.verification_status = 'unverified' then excluded.display_name
      else app.companies.display_name
    end,
    website_url = coalesce(app.companies.website_url, excluded.website_url),
    website_domain = coalesce(app.companies.website_domain, excluded.website_domain),
    industry = coalesce(app.companies.industry, excluded.industry),
    verification_scope = case
      when app.companies.verification_status = 'unverified' then excluded.verification_scope
      else app.companies.verification_scope
    end,
    record_status = case
      when app.companies.verification_status = 'unverified'
       and app.companies.record_status in ('draft', 'pending', 'published')
        then 'published'::app.record_status
      else app.companies.record_status
    end,
    updated_at = clock_timestamp();

insert into app.company_fact_citations (
  company_id, fact_key, fact_value, source_kind, source_url, source_title,
  retrieved_at, fact_checked_at, review_due_at, status
)
select
  company.id,
  fact.fact_key,
  fact.fact_value,
  'official_site',
  catalog.source_url,
  catalog.source_title,
  ${sqlLiteral(manifest.generatedAt)}::timestamptz,
  ${sqlLiteral(manifest.generatedAt)}::timestamptz,
  ${sqlLiteral(manifest.reviewDueAt)}::timestamptz,
  'current'
from african_company_catalog catalog
join app.companies company on company.slug = catalog.slug
cross join lateral (
  values
    ('brand_name', jsonb_build_object('value', catalog.display_name)),
    ('website', jsonb_build_object('value', catalog.website_url)),
    ('official_domain', jsonb_build_object('value', catalog.website_domain)),
    ('industry', jsonb_build_object('value', catalog.industry))
) as fact(fact_key, fact_value)
on conflict (company_id, fact_key, source_url) do update
set fact_value = excluded.fact_value,
    source_title = excluded.source_title,
    retrieved_at = excluded.retrieved_at,
    fact_checked_at = excluded.fact_checked_at,
    review_due_at = excluded.review_due_at,
    status = 'current',
    updated_at = clock_timestamp();

insert into app.company_domains (
  company_id, domain, domain_kind, is_official, citation_id,
  verified_at, review_due_at
)
select
  company.id,
  catalog.website_domain,
  'corporate',
  true,
  citation.id,
  citation.fact_checked_at,
  citation.review_due_at
from african_company_catalog catalog
join app.companies company on company.slug = catalog.slug
join app.company_fact_citations citation
  on citation.company_id = company.id
 and citation.fact_key = 'official_domain'
 and citation.source_url = catalog.source_url
on conflict (domain) do update
set citation_id = excluded.citation_id,
    verified_at = excluded.verified_at,
    review_due_at = excluded.review_due_at;

commit;
`;
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const coverage = validateManifest(manifest);
  const generated = buildMigration(manifest);
  const check = process.argv.includes("--check");
  if (check) {
    let current;
    try {
      current = await readFile(migrationPath, "utf8");
    } catch {
      fail(`generated migration is missing at ${migrationPath}`);
    }
    if (current !== generated) {
      fail("generated migration is stale; run npm run companies:catalog:build");
    }
  } else {
    await writeFile(migrationPath, generated, "utf8");
  }
  process.stdout.write(
    `African company catalog valid: ${expectedCount} companies, ${coverage.countries.size} markets, ${coverage.regions.size} regions (${check ? "generated SQL current" : "generated SQL written"}).\n`,
  );
}

await main();
