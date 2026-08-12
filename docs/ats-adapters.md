# ATS adapters

An adapter is not a scraper. It is a documented reader of a feed the employer
publishes deliberately, with a recorded rights basis and a contract that says
exactly what it extracts.

## Currently implemented

| Provider        | Rights basis                | State (adapter)                                        |
| --------------- | --------------------------- | ------------------------------------------------------ |
| Greenhouse      | Employer's own public board | Adapter live; boards active                            |
| Lever           | Employer's own public board | Adapter live; no active board                          |
| Ashby           | Employer's own public board | Adapter live; boards registered, activation per policy |
| Workable        | Employer's own public board | Adapter live; boards active                            |
| SmartRecruiters | Reviewed licence (#93)      | Adapter live; activation per policy                    |

An adapter being live says nothing about which boards run: migrations seed
only the three reviewed Greenhouse boards (pgTAP 90 pins that), and every
further board is registered operationally through the source-policy chain —
production's active estate is therefore wider than the seeded set.

Owner decision 2026-07-21: an employer's own public ATS board is a valid
basis for display, with guardrails — attribution, employer apply URL as the
only destination, instant revocation.

### Workable location variants

Workable's widget can emit one row per posting-location pair. The adapter
consolidates those rows only when every non-location employer fact is
identical, then evaluates eligibility from the complete location set.
Conflicting rows keep their duplicate external ID and are quarantined. Fetch
receipts expose `consolidatedRecordCount`, so every provider row remains
reconcilable with accepted, filtered and invalid counts.

## The contract every adapter must define

Adding a provider means answering all twelve of these in code, not
discovering them later in production:

| Requirement                  | Why it is separate                                            |
| ---------------------------- | ------------------------------------------------------------- |
| Source-rights classification | Decides publication before anything is fetched                |
| Discovery method             | A careers-page link is evidence; a slug guess is a hypothesis |
| Pagination                   | Silent truncation looks identical to a small employer         |
| Rate limits                  | Workable returns 429 after roughly 60 rapid probes            |
| Job identity                 | Requisition ID where offered; never title alone               |
| Employer identity            | Tenant is the strongest evidence available                    |
| Location fields              | Absent location fails a publication gate                      |
| Remote fields                | "Remote" alone never resolves to a country                    |
| Salary fields                | Undisclosed stays undisclosed                                 |
| Application destination      | Must be the employer's own destination                        |
| Closure detection            | Absence in a **complete** snapshot only                       |
| Parser-version tests         | A provider changing shape must fail loudly                    |

## Candidates, and what each still needs

These are not implemented. Each needs a rights decision of its own — being
publicly reachable is not permission.

| Provider   | Technical shape                    | Blocking question                                                |
| ---------- | ---------------------------------- | ---------------------------------------------------------------- |
| Recruitee  | Public JSON per tenant             | Same employer-board basis as Greenhouse? Likely, needs recording |
| Teamtailor | Public JSON per tenant             | As above                                                         |
| Workday    | Tenant-specific, often POST search | Whether public access is contractually supportable at all        |
| BambooHR   | Public per-tenant board            | Terms review outstanding                                         |

The honest position on Workday is that its endpoints vary per tenant and its
terms are the least clear of the four; it should be last, not first, despite
being the largest by employer count.

## Parser-version tracking

Every receipt now records `parser_version` and `transformation_version`
(migration `20260801000000`). Without them, a provider quietly changing its
payload is indistinguishable from employers quietly stopping hiring — the
counts fall either way. Legacy receipts carry null and are not backfilled.
