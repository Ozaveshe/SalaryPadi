# Privacy and retention

Entry point; classification in [data-classification.md](data-classification.md),
contribution design in [contribution-privacy.md](contribution-privacy.md),
company-intelligence retention in
[COMPANY_INTELLIGENCE_PRIVACY_RETENTION.md](COMPANY_INTELLIGENCE_PRIVACY_RETENTION.md).

## Holding today

- Three-identity separation (account / moderation / public aggregate)
  enforced by RLS and view projections; employers have no path to a
  contributor identity; verification documents are refused at four layers.
- Aggregate thresholds are policy-table-driven (`app.privacy_rule_versions`)
  with shape suppression; sub-threshold counts never render.
- Server-side authorisation everywhere: per-request CSP nonce, protected-path
  proxy (503 on auth outage, never a fake redirect), origin checks on every
  mutation, bounded bodies, server-named private CV storage with 60-second
  signed URLs, append-only audit stores.
- Analytics are structurally privacy-safe: name + pathname only on the wire
  (test-pinned), HMAC-hashed IP with daily salt, server-checked consent.

## Honest gaps

- **User-controlled retention does not exist** (no 90-day / 1-year / manual
  preference, no advance deletion warning). Export, account deletion and
  correction are human-fulfilled tickets, not automation. Two briefs have
  asked; it remains unbuilt — no trust page may claim otherwise.
- Retention automation is missing for `contribution_drafts` (90-day bound)
  and `contribution_abuse_signals` (30-day bound): constraints exist, no
  purge worker covers them.
- Reads of highly-sensitive records are not audited (mutations are).
- Rate limiting covers `/api/tools/*`, `/api/auth/*` (edge) and analytics
  (DB); applications, contributions, community and privacy-request routes
  have none.
