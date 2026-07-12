# Phase Two production release record

## Outcome

**Released — 2026-07-10.** SalaryPadi Phase Two operational readiness is live on the canonical production origin. This record separates repository, database, deployment, worker, provider, authentication, and human-control evidence.

## Release identity

| Evidence                       | Production record                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| Repository                     | Private GitHub repository `Ozaveshe/SalaryPadi`                                          |
| Canonical application revision | `3eeacd3275f4a5a809ae2037b60e892e25b88800`                                               |
| GitHub CI                      | Run `29078682748`, successful on `main`                                                  |
| Netlify project                | `salarypadi`                                                                             |
| Application proof deploy       | `6a50a7d9fca0170008db8717`, ready and published from the canonical application revision  |
| Canonical origin               | `https://salarypadi.com`                                                                 |
| Rollback artifact              | Deploy `6a509f1e61353f0008e40293` at revision `6ea45f67a414d5f7850a6e02614d9cb7fada5870` |
| Supabase project               | `bxelrhklsznmpksgrqep`                                                                   |
| Hosted migration set           | `20260710000100` through `20260710001000`                                                |

## Verification evidence

- Formatting, lint, strict type checking, 174 unit tests, the production build, public browser journeys, and the complete local database/pgTAP CI job passed on the canonical revision.
- The hosted schema exposes only `api`. The hosted migration set is applied, generated API types are current, the database security advisor reports zero errors and zero warnings, and the production secret scan reported no matches. Its ten informational policy-less RLS notices are intentional fail-closed internal tables.
- Passwordless authentication uses branded Resend mail from `mail.salarypadi.com`. Both sign-in and confirmation templates use one-time token hashes verified by `/auth/confirm`; a controlled production smoke set a session cookie and reached `/saved` without relying on the requesting browser's PKCE cookie.
- The production `support@salarypadi.com` account has an active `admin` role with the recorded project-owner bootstrap reason. Its `SalaryPadi admin` TOTP factor is verified, and the human operator reached `/admin`, proving the application-enforced AAL2 gate. No QR code, factor secret, recovery material, one-time code, or session token was retained by automation.
- The four published Netlify schedules are registered and have successful production run evidence. `/api/health` reports `job_source_sync`, `alert_delivery`, `currency_rates`, and `operations_maintenance` inside their stale thresholds.
- Job alerts and authentication mail use separate restricted credentials. The real authentication delivery reached `support@salarypadi.com`; open/click tracking remains disabled.
- First-party analytics remains consent-gated and aggregate-only with 90-day retention. European Commission InforEuro reference rates retain source URL, data month, review state, freshness, fallback, and user-facing limitations.

This historical release statement covers the 10 July baseline. The 12 July
measurement update preserves those first-party counts and introduces a new,
separately versioned consent choice before any Google Analytics tag can load.

- `support@`, `privacy@`, `security@`, `sources@`, and `ops@` ownership is assigned to Oza as interim accountable operator under the internal response targets in [Operations](OPERATIONS.md).
- GitHub Actions uses supported action majors. The tested PostCSS override removes the known advisory without downgrading Next.js, and `npm audit --omit=dev` reports zero known vulnerabilities.

## Residual operating requirements

These are tracked growth and resilience requirements, not blockers to the recorded release:

- appoint and verify a second named AAL2 recovery administrator before claiming continuous staff coverage or removing the bootstrap account;
- add an external production log sink and incident-paging integration before claiming automated 24/7 response;
- add edge/network abuse controls before broad public contribution growth;
- continue provider-terms, source-freshness, dependency, queue-age, and scheduled-worker checks at the documented cadence.

Operational procedures, rollback controls, incident actions, data ownership, and daily checks remain authoritative in [Deployment](DEPLOYMENT.md), [Operations](OPERATIONS.md), [Security](SECURITY.md), and [Data sources](DATA_SOURCES.md).
