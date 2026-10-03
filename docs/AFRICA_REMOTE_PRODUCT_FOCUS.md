# Africa remote product focus

Decision date: 2026-10-03

SalaryPadi helps people living in African countries find remote jobs they can apply for, with location evidence and restrictions visible. Eligibility refers to where an applicant can work from, not nationality or a promise of employment.

## Product relationship

Remote discovery leads acquisition. Local and hybrid jobs, company research, salary evidence, pay and offer tools, tracking, contributions and alerts remain available. Nigeria-specific tax tools remain explicitly Nigeria-specific.

## Implemented scope

- Homepage search defaults to the existing Africa remote path, with access to Nigeria remote and the full catalogue.
- Featured roles and the main coverage figure use currently publishable remote jobs with Africa eligibility evidence.
- Africa search sorts by query relevance and recency without Nigeria priority. The Nigeria-specific evidence ranker is bypassed on this path until it supports an applicant-country context.
- Africa cards, previews and job-detail headings name eligible countries, regional scope and exclusions. The homepage and Africa search omit Nigeria-specific currency estimates; dedicated Nigeria tools remain available.
- Existing alert search contracts retain the Africa path. No database migration, source activation or country-pack activation is included.

## Live supply snapshot: 2026-10-03

Read-only checks used the verified SalaryPadi Supabase project `bxelrhklsznmpksgrqep` and `api.jobs`. These are database-view counts, not a browser inventory audit or proof of applicant acceptance.

Of 265 visible database jobs, 98 explicitly record remote work: 44 worldwide, 17 EMEA, 13 Africa-wide, 14 Nigeria-specific and 10 named-country roles. Another 161 have unspecified work arrangement; four are onsite and two hybrid. Unspecified work is not counted as remote.

The ten named-country remote roles collectively name African countries including Egypt, Ethiopia, Ghana, Kenya, Morocco, Nigeria, Rwanda, Senegal, South Africa and Uganda. A union of named countries is not proof that every role accepts every country. Regional/worldwide exclusions and work-authorization conditions still need applicant-level checks. Some named lists also contain non-African countries.

The earlier health endpoint labels its 265-row catalogue count `visible_remote_jobs`; it must not be treated as an audited remote-only figure. Homepage coverage in this change uses the actual work mode, eligibility and publication predicates.

## Next implementation

The next release adds applicant-country selection and carries the same eligibility decision through discovery, recommendations and alerts. The ordered work, source rules, acceptance criteria and release checks are in [Africa remote implementation and next steps](AFRICA_REMOTE_IMPLEMENTATION_PLAN.md).

Start with AR-01 (shared country eligibility), AR-02 (country-aware discovery) and AR-03 (country-aware alerts). Refresh country coverage before selecting source expansions. All existing product surfaces remain part of the journey.

## Release evidence

This document describes source changes and a delivery plan, not a deployed release or verified new supply. Country packs retain their existing readiness gates. New countries must not be advertised as having complete local tax, salary or employer coverage merely because remote jobs mention them.

Validation completed: 239 unit-test files / 2,350 tests passed with three workers; lint, formatting and the Node 22 production build (including TypeScript) passed. The initial unconstrained test run hit one XML test timeout and one outdated copy assertion; the copy assertion was updated and the complete bounded rerun passed. Local mobile browser checks confirmed the Africa default, form navigation to `/jobs?path=remote_africa`, and no horizontal overflow at 390px on the homepage or search. Local browser checks used an unconfigured backend and do not prove live listing rendering, account operations or email delivery. Development-tool CSP console errors were observed; no production-browser smoke was performed.
