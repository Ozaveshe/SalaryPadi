# Coresignal API evaluation

Evaluated 30 July 2026 on a 7-day free trial (2,000 credits; 30 spent).
Method: free `search/es_dsl` count probes plus 30 collected sample records
for Nigeria. All numbers below are from live API responses on the
evaluation date, not marketing pages.

## Measured coverage (Multi-source Jobs API)

| Market        | Active now | Active, posted last 30d | Active with salary |
| ------------- | ---------- | ----------------------- | ------------------ |
| Nigeria       | 28,257     | 4,980                   | 5,084              |
| Ghana         | 6,620      | 1,128 (any status)      | not probed         |
| Kenya         | 4,480      | 3,261 (any status)      | not probed         |
| South Africa  | 394,308    | 100,126                 | not probed         |
| United States | 54,263,230 | —                       | — (baseline)       |

All-time NGN-denominated structured salary records: 16,582.
`accepts_remote` is unpopulated for Nigeria (0 hits) — our own
eligibility parser remains the remote/eligibility authority.

## Sample quality (30 recent active Nigerian records, 30 credits)

- **Source mix: effectively LinkedIn.** 28/30 records were LinkedIn-only
  (55 LinkedIn source entries vs 14 Indeed across the sample). For these,
  the only application destination is the `linkedin.com/jobs/view/...`
  guest page (verified live, HTTP 200). Only 2/30 carried an
  `external_url` (one direct employer careers page, one Indeed NG).
- **Freshness is real.** `date_posted` values were 0–6 days before
  Coresignal's `created_at`; the reviewer claims of months-old data did
  not reproduce for this cohort. Per-source `status`
  (active/inactive) and cluster `status` (1/2/3) support our lifecycle
  worker's absence-evidence model.
- **Salary is sparse in the fresh LinkedIn inflow** (1/30) even though
  18% of all active Nigerian records carry structured salary — salaried
  records skew to board sources, not LinkedIn. The salaried record was
  well-formed: `NGN 600000-700000/MONTH` with source text.
- **Noise ≈ 20%.** Poetry prizes, webinars and competitions listed as
  jobs, a mis-geocoded Texas municipality record, wrong-country records
  (BrighterMonday Uganda, DRC Kenya). Ingestion needs employment-type and
  event-pattern filters plus the existing quarantine path.
- Descriptions are full (29/30 over 200 chars) — usable only if the
  signed Coresignal terms cover storage and display of description text.

## Credit economics

Searches are free (confirmed: `x-credits-remaining` unchanged across ~25
searches). Collect = 1 credit per job record. Trial: 2,000 credits.
Paid: Mini $49/2,500 · Starter $199/12,000 · Pro $499/35,000 ·
Growth $1,000/150,000 monthly credits. Nigeria's fresh inflow (~5k
posted/30d) plus Ghana and Kenya fits inside Starter with headroom;
South Africa at full volume needs Growth or aggressive filtering.
Company/Employee records cost 10–20 credits — not needed for supply.

## Fit

- **Supply lane:** fills the reserved `licensed_africa_partner` adapter
  (kind `licensed_partner`, disabled since 14 July 2026 for lack of a
  signed licence). Authority order `direct > employer ATS > licensed >
  secondary` puts these records above Jobicy/Himalayas. Realistic yield
  after noise filtering: roughly 130–150 net-new Nigerian jobs/day
  against the 500/day target — the largest single authorized lane
  available today, not sufficient alone.
- **Salary evidence:** ~5,000 active salaried Nigerian records and
  16.5k NGN historical records map directly onto
  `app.job_salary_evidence` (bounds, currency, period, source text).
  This is the highest-value use of the remaining trial credits.
- **Country packs:** live counts above are hard evidence for the
  GH/KE/ZA activation guard's job-count gate; South Africa is
  strikingly deep (394k active).
- **Not pursued:** Employee API (personal-data records — internal
  tooling only per conventions), Agentic Search (20–180 credits/query).

## Second exploration: other APIs + West Africa (30 July 2026)

312 further credits spent (total 342; 1,658 remain, trial expires 6 Aug).

### West Africa jobs coverage (free probes, `match_phrase` exact)

| Market         | Active | Fresh (30d) | Active w/ salary |
| -------------- | ------ | ----------- | ---------------- |
| Ghana          | 6,620  | 652         | 161              |
| Côte d'Ivoire  | 977    | —           | —                |
| Senegal        | 881    | 515         | 77               |
| Liberia        | 1,135  | —           | —                |
| Guinea         | 1,079  | —           | —                |
| all others     | <700   | —           | —                |

Côte d'Ivoire only matches the accented spelling `Côte d'Ivoire`.
"Niger" reports 18,727 active jobs, but sampled records are US postings
(Lincoln, Nebraska) mis-geocoded — treat Niger as unusable and enforce a
country-consistency filter on every ingested record. Earlier South
Africa/US counts shrank ~11% under exact-phrase matching (ZA true
active: 351,539); Nigeria's single-token counts stand.

**Conclusion:** a West-Africa-only launch scope via Coresignal is
effectively Nigeria + Ghana, with token Senegal/Côte d'Ivoire coverage.

### Company API (multi-source, 20 credits/record) — defer

Records are wide (169 fields: industry, size, founded, funding rounds,
followers, website, active-postings count) but entity resolution is
hazardous. Name search returned an acquired shell for "Moniepoint",
a training-school record for "Access Bank", and an Australian
real-estate agency for "Andela". Domain lookup (`website_domain`) is
better only when unique: `andela.com` → 1 match, correct record;
`flutterwave.com` → 26 claimant records topped by a 1-person solar
company; `moniepoint.com` → subsidiary MFB record with
`employees_count: 0` contradicting its own `size_range: 1001-5000`.
Publishing wrong-entity enrichment on employer pages is a truth-first
violation; using this at launch would require a ranked-candidate
resolution pipeline plus review. Defer; revisit post-launch for a
manually-reviewed top-employers set. Base tier (10 credits, 45 fields)
has the same resolution problem.

### Historical Headcount API (10 credits) — reject

Series for Moniepoint (by resolved ID and by slug), Flutterwave, and
Paystack all end in 2020–2022, mostly null-tailed. No current headcount
signal for Nigerian companies.

### Employee API (20 credits/record) — reject for now

7.26M Nigeria / 1.97M Ghana profiles; the sampled record was rich
(110 fields, inferred skills, full experience history). Convention
forbids publishing personal profiles; internal aggregate analytics
(e.g. skills demand) would need thousands of collects to clear privacy
thresholds — not worth trial or launch-phase spend.

### Agentic Search API — reject

One `/fast` query (jobs, Lagos, salary-bearing) cost 20 credits and
returned an empty array. We write ES DSL directly; this tier adds cost,
not capability.

### Free search layer — adopt regardless

Count queries across jobs/companies/employees cost nothing, are
rate-limited at 5/s, and can power internal market-pulse metrics,
country-pack evidence, and coverage monitoring without collecting a
single record.

## Salary-evidence corpus (collected 30 July 2026)

1,540 credits converted the expiring trial into
`reports/coresignal-salary-corpus-2026-07.jsonl`: **1,599 active
salaried job records** (Nigeria 1,361 — all of Ghana's 161 and
Senegal's 77). 59 credits remain; trial expires 6 Aug.

- **Currencies:** NGN 1,180 · USD 191 · GBP 79 · EUR 52 · GHS 9.
  Period is dominantly monthly (1,224), matching Nigerian convention.
- **NGN monthly midpoints (n=1,099):** p10 ₦45,000 · median ₦120,000 ·
  p90 ₦375,000 — market-plausible. Outliers exist at both ends (min 5.5,
  max 1.7e12): ingestion needs bounds validation on top of the existing
  magnitude parsing.
- **Sources:** Indeed dominates salaried records (1,409 entries), then
  Glassdoor 257, Adzuna 190, LinkedIn 178, direct ATS 90 — the salaried
  corpus skews to boards, unlike the LinkedIn-skewed fresh inflow.
- **Freshness:** 665 records posted in 2026 (471 since May); ~700 date
  from 2022–2024 despite `status: 1`. Coresignal's active flag is not a
  liveness signal for old postings. Use the corpus as *dated* salary
  evidence (freshness-decayed per convention), never as live listings.
- **Quality:** 100% have company, 91% city, ~6% duplicate
  company+title+salary triples. Top companies are recruiting agencies
  (Odixcity 62, WorQulture 37), typical of the Nigerian Indeed
  ecosystem.
- Full raw records (169 fields each) are preserved gzipped at
  `reports/coresignal-salary-corpus-raw-2026-07.jsonl.gz` (1.9 MB); the
  plain JSONL keeps the salary-evidence projection (id, market, title,
  company, location, dates, salary array, application URL).

## Contract verdict (Self-Service Subscription Agreement, reviewed 30 July 2026)

The clickwrap accepted at signup is archived verbatim at
`docs/data/sources/coresignal-self-service-agreement-2026-07-30.md`
(source: https://coresignal.com/terms-and-conditions-api-dashboard/,
counterparty Deeptrace Inc., Delaware). What it settles:

- **Licence scope (1.1):** "internal business purposes" only.
- **Public listings are NOT covered (1.2.1, 1.2.2):** "The Client has no
  right to communicate or display to the public the Data, Substantial
  part of the Data" and no re-utilization ("making available to the
  public … online, or other forms of transmission"). Publishing raw
  Coresignal job records as listings on salarypadi.com on the
  self-service tier would breach the contract we signed — enforcement
  reality: account termination (Section 3.2) and the supply lane dies.
  **Public job supply from Coresignal requires a negotiated contract
  with display/republication rights** (their sales channel sells to job
  boards; the self-service tier simply doesn't include those rights).
- **Derivative works ARE covered (1.2.3):** "sufficient alteration"
  works are permitted, with the agreement's own example being
  "integration of individual data points taken from the Data to the
  Client's own product or service." Salary aggregates (percentiles per
  role/city computed from the corpus), market-pulse statistics, and
  free-search counts are clearly on the safe side. The 1,599-record
  corpus is therefore fully usable for the salary-benchmark lane
  (privacy threshold ≥3 contributors per cell per convention).
- **Personal data (9.1):** all compliance burden is on us — reinforces
  the employee-data internal-only rule.
- The agreement text still describes a 400/200-credit trial; the account
  was provisioned 2,000 unified credits with free searches — the
  document lags the product, note it if terms are ever disputed.

## Owner decisions (30 July 2026)

- Launch 1 September 2026; expansion scope is West Africa only.
- LinkedIn job pages approved as application destinations for
  Coresignal-sourced records (`job_sources[].url`, status=active;
  prefer `external_url` when present) — effective once a display-rights
  contract exists.

## Registration prerequisites (once display rights are negotiated)

1. Record the negotiated agreement's URL/date as `termsUrl` +
   `termsReviewedAt` in the `JobSourcePolicy` row; archive the document
   under `docs/data/sources/`.
2. Standard source registration (Moniepoint recipe), worker schedule
   registered `enabled=false`, pgTAP 90/91 board-set updates.
3. Ingestion filters: drop non-job employment types (Volunteer,
   event-like titles), enforce country-consistency checks, route
   ambiguous records through the existing quarantine path.
