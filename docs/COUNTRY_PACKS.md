# SalaryPadi country packs

Status: implementation complete in the repository; migration not applied to production; no deployment or country activation performed.

## Product boundary

SalaryPadi has one application and one country-pack registry. It does not create country-specific code forks, auto-translated copies, or indexable placeholder sites.

Nigeria is the launch pack. Ghana, Kenya, and South Africa are configured as candidates so engineering and data work can be tested without exposing a route or indexable page. Candidate configuration is not activation.

The source of truth for application behavior is `config/country-packs.json`. The database source of truth for measured activation evidence is `app.market_countries` plus the readiness tables introduced by `20260714030735_country_pack_architecture.sql`.

| Pack         | Route strategy             | Locale  | Currency | Time zone           | Public | Indexable                        |
| ------------ | -------------------------- | ------- | -------- | ------------------- | ------ | -------------------------------- |
| Nigeria      | Existing unprefixed routes | `en-NG` | NGN      | Africa/Lagos        | Yes    | Yes, subject to page-level gates |
| Ghana        | Reserved `/gh` prefix      | `en-GH` | GHS      | Africa/Accra        | No     | No                               |
| Kenya        | Reserved `/ke` prefix      | `en-KE` | KES      | Africa/Nairobi      | No     | No                               |
| South Africa | Reserved `/za` prefix      | `en-ZA` | ZAR      | Africa/Johannesburg | No     | No                               |

The registry deliberately contains no translated body copy. Its schema supports additional BCP 47 locales and left-to-right or right-to-left text, so a reviewed French locale can be added later without changing route or component code. A locale must be explicitly marked reviewed before it can participate in a public pack.

## What is normalized

The migration adds or extends these models:

- `app.market_countries`: ISO codes, slug, region, locale, currency, time zone, reserved route prefix, state, public/index flags, thresholds, and activation review.
- `app.currencies`, `app.country_locales`, and `app.country_time_zones`: formatting and locale reference data.
- `app.subdivisions` and `app.cities`: normalized geography. No production subdivision or city fixtures are inserted.
- `app.job_locations`: normalized subdivision/city/time zone plus exact `source_location_text` and physical-location classification.
- `app.job_eligibility` and `app.job_eligibility_countries`: existing normalized scope and included/excluded countries, while retaining exact evidence. `app.job_timezone_requirements` adds an overlap window and exact source wording.
- `app.job_salary_evidence`: already preserves original amount, currency, period, gross/net status, location scope, source text, and labelled derivations. Country packs do not replace that evidence with a converted display value.
- `app.companies`, `app.company_legal_entities`, and `app.company_locations`: existing brand/legal-entity separation plus normalized office geography.
- Private salary, review, interview, benefits, and pay-reliability submissions: a country and optional validated company office. Public review/interview records carry the office only after moderation; private identity and abuse evidence remain separate.
- `app.country_statutory_rule_versions`: versioned tax, employment, privacy, moderation, and takedown rules. Reviewed or active rows require citations, reviewer identity, review dates, and a future review deadline.
- `app.country_facts`: locale-specific factual claims with a citation and freshness window. It is not a review or opinion store.
- `app.source_country_rights`: source permission and field, storage, attribution, polling, retention, display, indexing, and Google JobPosting rights for one country. Country rights cannot exceed the reviewed global source policy.

Reference currency/locale/time-zone rows are configuration, not market content. The only subdivision/city examples are explicitly test-only records in `tests/fixtures/country-packs.json`.

## Eligibility rule

`security.job_explicitly_allows_country(job_id, country_code)` and the matching TypeScript helper use the same conservative rule:

1. An explicit exclusion wins.
2. An explicit included country is accepted.
3. `worldwide` is accepted unless excluded.
4. `africa` is accepted only for a country pack classified as African.
5. `nigeria` is accepted only for Nigeria.
6. `emea`, `restricted_region`, `unclear`, and generic remote wording are not country evidence.

Therefore, EMEA never means every African country. An EMEA role can become eligible for South Africa only when South Africa is also explicitly included in the source evidence.

## Rights boundary

Every provider fetch claim is guarded by `security.enforce_fetch_country_rights()`. A worker cannot obtain a fetch claim unless the source has a current, complete country-rights row for an active public pack and its global policy is also runnable.

Public job row-level security and Google Indexing eligibility also call `security.job_country_distribution_allowed(...)`. A stored job is not visible, indexable, or eligible for JobPosting solely because its global source flags are permissive; the matching active country right must independently allow that distribution.

The service-only `api.worker_get_source_country_rights(source_id)` RPC exposes only country codes that pass both layers. It never exposes permission evidence references to the worker response or public API.

The migration derives one Nigeria rights row for direct employer submissions from the already-reviewed global direct-employer policy. It does not create rights for Ghana, Kenya, South Africa, ATS boards, licensed feeds, or secondary feeds. Those exact external dependencies remain:

- written country scope in the licence or employer authorization;
- reviewed terms and permission evidence;
- allowed fields and description/storage rights;
- attribution requirements;
- country-specific display, search-index, and Google JobPosting permission;
- polling and retention limits;
- a completed dependency ledger with no missing item.

No credentials, licence, employer consent, or rights evidence is fabricated by this implementation.

## Activation gates

The default quantitative thresholds are policy settings, not claims about current supply:

- at least 100 active distinct canonical jobs whose source is runnable for the country;
- at least three authorized sources;
- at least 95% of counted supply with exact, recently verified local-location or eligibility evidence;
- at least one active reviewed tax rule version and one active reviewed employment-rule version;
- at least 20 unique, current, cited local content pages;
- at least 10 approved first-party contributions.

These human-reviewed gates must also be current:

- local eligibility accuracy;
- localized content quality;
- moderation, privacy, and takedown readiness;
- sitemap, canonical, hreflang, and route behavior.

`security.country_pack_gate_failures(...)` returns every blocker. The `market_countries_activation_guard` rejects public routes, indexing, or transition to `active` unless all gates pass, the default locale is reviewed, and an AAL2 administrator has recorded activation review. Lower-level checks also reject a candidate pack made public by a single flag change.

Passing the database gates produces “Ready for review,” not a release. Deployment and activation remain separately approved operations.

## Routes, canonicals, hreflang, and formatting

`src/lib/country-packs/routing.ts` owns route generation and parsing:

- `localizedCountryPath` returns `null` for candidate or suspended packs.
- `resolveCountryRoute` recognizes reserved prefixes but labels them non-public so a route handler must return 404.
- `countryAlternates` emits only public, index-enabled packs with reviewed locale content.
- `x-default` points to the current Nigeria canonical.

Job, company, salary, and programmatic job metadata use that helper. Sitemap XML emits the same language alternates and never emits `/gh`, `/ke`, or `/za` while those packs are candidates. Candidate salary leaf pages return 404, and candidate options in the salary directory are disabled and labelled “not live.”

`src/lib/country-packs/format.ts` formats currency, dates, and numbers from the pack's locale, original currency, and time zone. Conversions remain presentation choices; source salary values are preserved unchanged.

## Readiness dashboard

Protected route: `/admin/country-readiness`

Data source: `api.admin_get_country_pack_readiness()`

The dashboard shows measured supply, source diversity, explicit-eligibility ratio, cited content, first-party contributions, reviewed statutory-rule counts, thresholds, exposure flags, and every blocker. It requires an admin role and AAL2. Missing measurements are zero and blocked; they are never presented as passed or inferred.

## Adding or activating a pack

1. Add configuration to `config/country-packs.json` with `candidate`, public/index flags off, `autoTranslate: false`, and `contentStatus: configured`.
2. Add country reference rows and test fixtures. Do not insert example jobs, salaries, reviews, ratings, statutory facts, or claims into production.
3. Record country-scoped source rights only from written, reviewed evidence.
4. Ingest privately and measure canonical supply, source diversity, and exact eligibility evidence.
5. Add cited country facts and reviewed versioned statutory rules.
6. Establish local moderation, privacy, takedown, and response operations.
7. Complete crawl, canonical, hreflang, sitemap, status-code, and duplicate-route tests.
8. Record every qualitative gate review and resolve dashboard blockers.
9. Obtain explicit approval for activation and a separate explicit approval for deployment.

Never use machine translation to fill a content gap. If a locale lacks reviewed source material, leave it configured and non-public.

## Verification

Relevant automated coverage:

- `src/lib/country-packs/country-packs.test.ts`: registry fail-closed behavior, EMEA handling, formatting, routes, hreflang, fixtures, and readiness evaluation.
- `src/lib/operations/country-pack-readiness.test.ts`: dashboard contract and honest zero states.
- `src/lib/seo/sitemap.test.ts`: canonical sitemap inventory; country-pack tests verify inactive alternates are absent.
- `supabase/tests/database/100_country_packs.test.sql`: schema, rights, eligibility, activation, permissions, no fabricated candidate content, and test-only geography.

Production verification is intentionally outstanding because this task does not apply migrations, deploy, index routes, or activate sources.
