# Release gates

Entry point; deployment mechanics in [DEPLOYMENT.md](DEPLOYMENT.md).

## The suites (2026-08-09)

| Suite          | Size                                                                                            | Gate                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Vitest         | ~216 files / ~1,700 cases                                                                       | CI `quality` job, coverage thresholds 83/71/87/86                            |
| pgTAP          | 30 files / ~700 pinned assertions                                                               | CI `database` job replays every migration on a clean DB, then runs the suite |
| Playwright     | 13 specs × 3 viewports                                                                          | CI `e2e` job on a production build, env-less                                 |
| Scheduled      | production-freshness (6-hourly), production-acceptance (daily, commit-matched), two live smokes | GitHub Actions against production                                            |
| Deploy channel | `verify-deploy-channel.mjs`                                                                     | refuses a Netlify build whose commit has failing CI                          |

`npm run quality` = lint + typecheck + vitest + build; note it omits
`format:check`, e2e and pgTAP, so a green local quality can still fail CI on
formatting or database tests.

## Prohibited regressions under CI

The `prohibited-states` suite plus companions enforce: a failed read never
becomes confirmed-empty; unclear never enters the Nigeria collection or
outranks explicit; a broken apply link fails publication and never leads;
sponsored gains no score and skips no gate; missing rights fail first;
sub-threshold or identifying slices stay suppressed with no digit leaking;
employer edits to independent evidence are refused; assumptions degrade
values to estimates; thin pages refuse indexing; internal null-state labels
never ship (label list + route sweep); UTC date reasoning is pattern-banned
(including epoch-day division); analytics transmit name + path only; the
card's eligibility tone never contradicts the ranker.

Caveat the audit surfaced: several prohibited-state assertions target
specification modules rather than the shipped path — treat them as rule
documentation, and prefer adding shipped-path tests when touching those
areas.

## Journey coverage truth

Visitor journeys are deterministically covered. Member, contributor,
employer and operations journeys exist as specs but skip without
`E2E_USER_STORAGE_STATE` / `E2E_ADMIN_STORAGE_STATE`, which CI never sets —
they run only against a staged environment with isolated accounts. Closing
that is the largest single release-gate gap.
