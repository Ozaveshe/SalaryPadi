# African company catalog

SalaryPadi's first cross-Africa company cohort is a versioned, source-backed catalog of 100 listed companies. It is a profile-shell supply lane, not a review, rating, salary, job, or employer-verification dataset.

## Selection basis

The canonical manifest is `data/companies/africa-major-companies.v1.json`. Ranks 1–100 come from the African Business Top 250 Companies 2025 table, whose market-capitalisation data is dated 31 March 2025. The publisher's country column is retained as `marketCountry`; it describes the market represented by the ranking and must not be relabelled as headquarters or incorporation country.

Each catalog row also owns one official HTTPS website and normalized domain. Those official sites support only the factual shell fields generated into the database: brand name, website, official domain, and broad industry. They do not verify an employer account, legal entity, office, review, salary, benefit, interview, rating, headcount, or active vacancy.

The cohort covers 14 markets across North, East, West, and Southern Africa. It is intentionally faithful to the published top 100, so it is not a geographically balanced quota and currently has no Central Africa entry.

## Verification states

- `source_listed`: SalaryPadi has a current official-site citation for factual shell fields. This is the initial state for this catalog.
- `employer_verified`: an existing domain or organization verification process has completed. The catalog importer never assigns this state.
- `unverified`: no current retained source citation is available.
- Citation `review_due`: the retained source needs a new check. It must not be silently represented as current.

The generated migration publishes profile shells with the database verification value `unverified` and a narrow verification scope. The application maps a shell with current citations to the public `source_listed` label. Existing employer-verified records keep their stronger state and are not downgraded.

## Dedupe and upsert behavior

Run:

```powershell
npm run companies:catalog:build
npm run companies:catalog:check
```

The build command validates exactly 100 unique ranks, slugs, and official domains; HTTPS source boundaries; country/region coverage; and review dates. It then deterministically writes `supabase/migrations/20260714100000_african_company_catalog.sql`.

Before inserting, the SQL fails the entire transaction if an official domain already belongs to a different slug. Slug matches are upserted conservatively: missing factual fields can be filled, unverified shells can be refreshed, and stronger verification/removal states are preserved. Citation and official-domain rows are idempotent.

The migration is prepared local release material. Its presence in Git is not proof that production contains these companies. Apply it only through the SalaryPadi project-scoped migration lane after database tests and review; never point a generic Supabase target at this repository.

## Logo delivery

Browser image requests stay first-party at `/api/company-logos/{slug}`, which is compatible with the current `img-src 'self'` content-security policy. The route accepts only slugs in the canonical manifest. It never accepts a URL or hostname from a request, so it is not an arbitrary image proxy.

When `LOGO_DEV_PUBLISHABLE_KEY` is configured server-side, the route asks the fixed `https://img.logo.dev` origin for the manifest-owned official domain. It rejects redirects, non-raster content types, empty bodies, and responses larger than one MiB. It returns a cacheable deterministic SVG monogram when the provider is absent or unavailable. Provider output is presentation enrichment, not identity evidence. Logo.dev requires a publishable key and its own attribution/usage review before production activation.

## Review checklist

1. Run `npm run companies:catalog:check` and focused unit tests.
2. Review any manifest edit against the ranking source and the company's official site.
3. Confirm renamed companies retain stable slugs or add a cited alias rather than creating a duplicate.
4. Recheck official URLs before the six-month `reviewDueAt`; record unreachable or ambiguous sources as review debt instead of inventing replacements.
5. Run local Supabase database tests before applying the generated migration.
6. Configure and smoke-test the logo provider separately; monogram fallback is healthy degradation, not provider proof.
