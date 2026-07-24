# SalaryPadi Data Source Register

Authoritative list of every external data source, its rights basis and
operating constraints. The database enforces this via the three-gate
authorization (config/job-source-policy-registry.json + app.job_sources
policy rows + env kill switches); this document is the human-readable
register. Nothing publishes without an active rights basis.

## Job sources — live

| Source                               | Connector       | Rights basis                                          | Constraints                                                    | State    |
| ------------------------------------ | --------------- | ----------------------------------------------------- | -------------------------------------------------------------- | -------- |
| Moniepoint (Greenhouse `moniepoint`) | ats/greenhouse  | documented_public_api (employer's own public board)   | metadata only, attribution, employer apply URL, 6h poll, 4/day | active   |
| Canonical (Greenhouse `canonical`)   | ats/greenhouse  | documented_public_api                                 | same                                                           | active   |
| Zipline (Greenhouse `flyzipline`)    | ats/greenhouse  | documented_public_api; apply URLs on employer site    | same                                                           | active   |
| Kuda (Workable `kuda`)               | ats/workable    | documented_public_api (public widget API)             | same; destinations pinned to apply.workable.com/j              | active   |
| FairMoney (Workable `fairmoney`)     | ats/workable    | documented_public_api                                 | same                                                           | active   |
| Jobicy                               | feed descriptor | permitted public API                                  | ≤4 fetches/day, attribution, no full descriptions              | active   |
| Himalayas                            | feed descriptor | permitted public API                                  | 1/day, paced multi-page, partial tolerated                     | active   |
| Remotive                             | feed descriptor | REVOKED — awaiting written republication confirmation | env kill switch off                                            | disabled |

## Job sources — pending / planned

| Source                                       | Status                                                                         | Blocker                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| ReliefWeb API                                | Application submitted 2026-07-21 (support@salarypadi.com)                      | Await approval; connector = one feed descriptor           |
| SmartRecruiters (per-employer)               | Probed; zombie-board freshness rule applies (Vendease rejected: 2021 postings) | Record rights + freshness gate before enabling            |
| More Workable/Greenhouse/Ashby boards        | Continuous discovery; many NG tenants currently at 0 open roles                | Probe real postings (location + dates) before registering |
| Employer CSV upload / generic XML/JSON feeds | Release 3 build                                                                | Employer authorization recorded per feed                  |

**Prohibited:** LinkedIn, Indeed, Glassdoor, authenticated boards,
CAPTCHA-protected pages, any source whose terms bar automated access or
republication (e.g. NGX). No bot-protection bypass, ever.

## Salary benchmark sources

| Source                                   | Basis                            | Coverage                                       | Review due                            |
| ---------------------------------------- | -------------------------------- | ---------------------------------------------- | ------------------------------------- |
| US BLS OEWS (May 2025)                   | US public-domain statistics      | 10 role families, annual p25/median/p75        | ~2027-01-21 (lane goes dark on lapse) |
| UK ONS ASHE Table 14.7a (Apr 2025 prov.) | Open Government Licence v3.0     | 10 role families, full-time annual percentiles | ~2027-01-22                           |
| ILOSTAT (NG/GH/KE/ZA wage indicators)    | CC BY 4.0 (datasets ≥2023-05-03) | planned third lane                             | —                                     |

## Official pay scales (secured, awaiting dedicated surface)

| Source                                                      | Document                                                                       | Basis                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| NSIWC CONPSS 2024                                           | Circular SWC.04/T/140, effective 2024-07-29 (docs/data/sources/conpss2024.pdf) | Official government instrument; facts republished with citation |
| NSIWC CONHESS 2024                                          | same series (conhess2024.pdf)                                                  | same                                                            |
| NSIWC CONMESS                                               | conmess.pdf (verify revision)                                                  | same                                                            |
| National Minimum Wage Acts (₦70,000, 2024; history to 1981) | statute                                                                        | copyright-exempt                                                |

Rule: pay scales are deterministic tables — never published through
percentile-benchmark fields; they get the dedicated pay-scale surface.

## Company facts

| Source                                               | What                                                          | Basis                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| CBN /api/GetMFBs (829 MFBs), /api/GetDMBs (28 banks) | regulatory_license facts (Kuda, FairMoney, Zenith, GTCO live) | Official public register; facts with attribution; exact-licensee wording rule |
| PENCOM / NAICOM / NCC registers                      | planned                                                       | Official registers; attribute; no verbatim PDF reproduction                   |
| CAC public search                                    | per-company verification only                                 | ToS unverified — NO bulk harvesting                                           |
| Company official sites                               | descriptions, domains, logos-where-permitted                  | Facts about themselves; cited                                                 |

## Currency & payroll

| Source                                                             | What                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------- |
| Reference FX provider (existing `current_currency_rates` pipeline) | naira conversion for estimates; provider attribution retained |
| Nigeria statutory payroll rules (versioned in-repo)                | take-home engine                                              |

## Logo/brand enrichment (Release 2)

No provider integrated yet. Requirements before production use: terms
permitting logo display for third-party company profiles, attribution
requirements recorded here, env credential (`LOGO_API_KEY` placeholder),
per-company `logo_source`/`logo_attribution` stored. Fallback order:
employer-verified upload → permitted API → official-site icon where
permitted → deterministic monogram (never an empty box).
