# Employer identity

An employer appears under different names in every system that touches it:
the legal entity, the trading brand, the ATS tenant slug, the way a recruiter
typed it. Canonical employer identity is what lets a job, a salary cell, an
interview report and a regulator fact describe the same company.

## Tables

| Table                        | Holds                                                                   |
| ---------------------------- | ----------------------------------------------------------------------- |
| `app.companies`              | The canonical employer: brand name, slug, verification and claim status |
| `app.company_aliases`        | Known alternate and legacy names                                        |
| `app.company_domains`        | Corporate and careers domains                                           |
| `app.company_legal_entities` | Registered legal entities, for regulator claims                         |
| `app.company_locations`      | Country presence                                                        |
| `private.company_claims`     | Employer claims awaiting verification                                   |
| `private.ats_source_configs` | ATS provider and tenant identifiers                                     |

## Resolution order: deterministic evidence first

1. **ATS tenant identity.** A Greenhouse tenant `moniepoint` on a registered
   board is the strongest signal available, because the employer controls it.
2. **Verified domain.** A destination on a domain in `app.company_domains`.
3. **Exact alias match** against `app.company_aliases`.
4. **Fuzzy candidate generation** — and no further.

**Fuzzy matching generates candidates; it never merges.** A high-similarity
name pair produces a review item, not a decision. Merging two employers is
close to irreversible in its effects — salary cells, reviews and interview
reports all move — so it takes a human.

## Why the caution is not theoretical

Every one of these came out of real probing in this repository:

- **`carbon`** on Greenhouse is an unrelated US company, not Nigeria's Carbon.
  A slug-based guess would have registered a fake employer.
- **`branch`** is US Branch Metrics, not Branch International.
- **"Andela"** by name in a third-party dataset returned an Australian real
  estate agency.
- **`flutterwave.com`** was claimed by 26 records in the same dataset, topped
  by a one-person solar company.
- **Moniepoint's** own record in that dataset was a subsidiary shell with
  `employees_count: 0` contradicting its own size band.

The general rule: **a name is not an identity, and a domain is only an
identity when it is unique.**

## Parent and subsidiary stay distinct

A parent company is not its subsidiary, and this matters most for regulator
claims. A holding company is described as **"group parent of a licensed X"**,
never as "licensed X". GTCO is worded that way in production precisely
because the licensed entity is the bank, not the group.

Merging a parent into a subsidiary would let a licence held by one entity
appear to cover another — a false claim about a regulated business.

## Verification and claims

| Status            | Meaning                             |
| ----------------- | ----------------------------------- |
| Unclaimed         | No employer has claimed the profile |
| Claim pending     | Claimed, awaiting verification      |
| Verified employer | Claim confirmed                     |

Verification affects what an employer may do — respond to reviews, submit
roles — but never suppresses evidence. A verified employer cannot delete
contributions about it.

## Logos

Logos are self-hosted with recorded provenance and usage rights. The
third-party logo service was removed because a logo shown without the right
to show it is the same category of problem as text republished without a
licence.

## Verified state

216 canonical employers, 103 with verified domains, 0 recorded aliases.

The alias table being empty is worth naming: alias resolution is available
but unused, so employer matching currently leans on ATS tenant and domain
evidence. That is the strong end of the evidence ladder, but it means an
employer appearing under a genuinely different trading name is not yet
resolved to its canonical record. **113 employers have no verified domain**,
so destinations for those cannot yet be proven to be direct-employer links.
