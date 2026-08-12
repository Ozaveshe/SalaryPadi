# Finished product definition

What "finished" means for SalaryPadi, based on the 9 August 2026 audit and
verified product-completion work through 11 August 2026
([product-completion-audit.md](product-completion-audit.md)).

SalaryPadi is finished when one connected journey works without losing
context: discover a job → verify eligibility → inspect employer and pay
evidence → save or analyse → apply through a verified destination → track →
record interviews → compare an offer → record the outcome → optionally
contribute evidence. Canonical job and employer context must carry across
every transition; the user never re-enters employer, role, location, salary,
currency, period or destination.

## The ten actors and their state

| Actor                              | Works today                                                                               | Largest open gap                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Visitor searching                  | Yes — evidence-first search with honest failure states                                    | No mobile filter sheet                                                    |
| Candidate checking eligibility     | Yes — basis-aware badges, filters and ranking agree                                       | Evidence basis is bounded on cards; deeper comparison remains detail-only |
| Candidate researching employer/pay | Yes — company lanes, salary lanes, employer responses rendered                            | Pay-reliability has no public company lane                                |
| Candidate applying and tracking    | Yes — apply-out, tracker with point-in-time snapshot                                      | 7 of 13 tracker states; no reminders beyond one date                      |
| Candidate comparing an offer       | Partial — compare works, context carries                                                  | No persistence, scenarios, equity or currency-risk modelling              |
| Contributor                        | Yes — five moderated flows, drafts, four-layer PII refusal                                | Retention automation for drafts/signals                                   |
| Employer                           | Partial — claim, preview/post, track/close own listings, respond                          | No employer analytics; sponsored products remain intentionally unbuilt    |
| Career-data associate              | Yes — source-backed intake, searchable job evidence and duplicate decisions are reachable | No bulk intake UI                                                         |
| Moderator                          | Yes — AAL2 queue, actions and named safety flags are reachable                            | No dedicated case-detail view beyond the privacy-safe queue summary       |
| Administrator                      | Partial — source/supply health strong                                                     | No audit-log reader, no moderation-backlog metric, no flag service        |

## Non-negotiables already holding

Fail-closed source rights at repository, worker and RLS; privacy thresholds
policy-table-driven with shape suppression; contributor identity separated
from employers at four layers; no fabricated evidence anywhere; failed reads
never render as zero jobs; money buys neither trust nor ranking.

## Acceptance criteria not yet met

Deterministic e2e coverage for the member/contributor/employer/operations
journeys (env-gated off in CI); the north-star metric's qualifying dimensions;
and public-page caching to the p95 targets. User-controlled workspace
retention, source-backed operator intake, searchable protected job detail and
duplicate-candidate field-by-field comparison are now implemented.
