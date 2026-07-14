# Company Intelligence Production Audit

Audit date: 14 July 2026

Production project: `bxelrhklsznmpksgrqep`

Mode: read-only production inspection; implementation migrations are local and unapplied

## Outcome

Production contains no stored company-intelligence records or first-party contributions. The public site nevertheless exposes 17 company shells synthesized from the job feed, and each shell has review, salary and interview leaf routes that return HTTP 200 with honest empty states. None of those company routes appears in the main sitemap.

No copied workplace opinion was found in production. The repository contains synthetic review text in tests only; no runtime fixture, seed, search-index input or AI-prompt path contains named external-review material. The prepared quarantine migration would therefore change zero rows at the audited production baseline. It still preserves a text-free hash, prior state, relation, record identifier, reason and migration version if an unverifiable row is encountered in another environment.

The machine-readable evidence is [company-intelligence-audit.json](../reports/company-intelligence-audit.json). `npm run audit:company-intelligence` searches runtime application, migration, seed/index and prompt scopes and fails if a named external-review source appears in a company-opinion ingress context. It reports file names and counts, never matched text.

## Production and fixture findings

| Evidence                             |                   Audited result |
| ------------------------------------ | -------------------------------: |
| `app.companies`                      |                                0 |
| `app.company_locations`              |                                0 |
| `app.company_benefits`               |                                0 |
| `app.review_publications`            |                                0 |
| `app.interview_publications`         |                                0 |
| `app.salary_aggregate_snapshots`     |                                0 |
| `app.company_rating_snapshots`       |                                0 |
| `private.contributions`              |                                0 |
| `private.moderation_actions`         |                                0 |
| `community.feed_posts`               |                                0 |
| `community.forum_threads`            |                                0 |
| `community.forum_replies`            |                                0 |
| `community.forum_topics`             | 5 taxonomy rows; no user opinion |
| Public job-derived company shells    |                               17 |
| Company URLs in the main sitemap     |                                0 |
| Runtime company-opinion fixtures     |                                0 |
| Test-only synthetic opinion fixtures |    Present and isolated to tests |

The 17 visible slugs were `a-team`, `clerky-inc`, `coalition-technologies`, `credit-wellness-llc`, `endureed-by-global-innovation`, `everai`, `fse-llc`, `iapwe`, `impact-clients`, `lawnstarter`, `lemon-io`, `mitre-media`, `quinncia-inc`, `telus-digital`, `the-obesity-society`, `tribe-wellness`, and `unio-digital`.

Those pages must not be described as verified profiles. They are discovery shells whose names come from current job occurrences. A shell becomes a factual company profile only when `api.companies` supplies current cited facts.

## Implemented data boundaries

```text
authenticated contributor
  -> private draft (owner-only, maximum 90 days)
  -> typed first-party submission + origin attestation
  -> private identity / verification / abuse signals
  -> automatic code-only flags
  -> moderation case + immutable actions
  -> approved redacted publication OR privacy-cohort aggregate
  -> public company page (no author identity)

official source / filing / registry / verified employer submission
  -> factual citation with retrieval, check and review dates
  -> normalized brand, entity, alias, domain or office fact
  -> public company page with source and freshness
```

The company model now separates:

- brand record in `app.companies`;
- legal entities in `app.company_legal_entities`;
- aliases in `app.company_aliases`;
- official domains in `app.company_domains`;
- offices in `app.company_locations`;
- cited facts in `app.company_fact_citations`;
- private submissions, identity, verification and abuse signals in `private`;
- moderated employer speech in `app.employer_responses`;
- community aggregates in rating, salary, benefit and pay-reliability snapshots.

Allowed factual source kinds are closed to `official_site`, `public_filing`, `public_registry`, and `verified_employer_submission`. A verified-employer fact requires a claim reference. The public API omits uncited website, industry, size, description and headquarters values.

## Prepared factual seed

The local migration prepares three narrowly scoped profiles selected from visible shells whose official sites returned HTTP 200 during the audit:

| Company                | Official evidence                              | Seeded facts                    | Review due      |
| ---------------------- | ---------------------------------------------- | ------------------------------- | --------------- |
| Coalition Technologies | `https://coalitiontechnologies.com/who-we-are` | brand, website, official domain | 14 January 2027 |
| TELUS Digital          | `https://www.telusdigital.com/`                | brand, website, official domain | 14 January 2027 |
| LawnStarter            | `https://www.lawnstarter.com/`                 | brand, website, official domain | 14 January 2027 |

No description, legal entity, office, industry, headcount, review, rating, salary, interview result or employer-verification claim is inferred or seeded. The migration has not been applied to production.

## Public release rules

- Individual workplace reviews require first-party attestation, human moderation, and a minimum public company cohort of five. Rare role and country groups stay withheld below three contributors. The overall rating requires five approved independent contributors.
- Interview accounts require three independent approved contributors at the company; rare role and country groups stay withheld, and application source, seniority, feedback and outcome are not published at individual level.
- Salary aggregates continue to use the active privacy rule for each salary cell and expose sample size, country, role, arrangement, currency, gross/net basis, date range, verification mix and confidence.
- Community benefits and coarse pay-reliability patterns require five independent approved contributors, a 24-hour publication lag, country scope, date range, verification mix and confidence.
- Employer responses are separately labelled. They cannot update review publications, rating snapshots or salary aggregates.
- Documents and payslips are rejected at form, API and database boundaries. The `document_verified_later` program is disabled.

## Quarantine behavior

`20260714030100_company_fact_provenance.sql` removes from public state any review or interview publication whose linked contribution lacks first-party origin attestation. It removes legacy `community_reported` benefit rows because that table has no contributor provenance. The audit record stores a SHA-256 digest, never the original text. Quarantine rows and moderation actions reject update and delete operations.

## Proof commands

```powershell
npm run audit:company-intelligence
npm run typecheck
npx vitest run src/lib/contributions src/lib/companies src/app/api/contributions
npx supabase test db
```

The final command requires a running local Supabase stack. It must not be pointed at production. The database suite includes `98_company_intelligence_first_party.test.sql` for identity leakage, source allowlists, document disablement, RLS, aggregate thresholds, immutable audit and employer mutation boundaries.

## Unknowns and release blockers

- The five migrations in this change are prepared, not applied. Their presence is not production proof.
- No authenticated end-to-end journey was run against production, and no test identity was created.
- No real contribution acquisition or moderation conversion baseline exists.
- Work-domain matching is a signal reviewed by a human; it is not proof of authority by itself.
- Backup deletion, legal-hold execution and incident notification require an approved organization-level operating decision before launch.
- The public 17-shell inventory can change with the job feed; the machine artifact is the 14 July snapshot.
- No Search Console data was available in this audit.
