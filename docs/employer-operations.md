# Employer operations

Entry point; boundaries in
[employer-data-boundaries.md](employer-data-boundaries.md), identity in
[employer-identity.md](employer-identity.md).

## Claim

`/companies/[slug]/claim` → moderated case → AAL2 staff review. The
submission records whether the claimant's signed-in email matches an official
company domain; since `20260809140000` the queue states that result and
verifying a mismatched claim requires an `override:domain_mismatch` reason,
recorded on the claim and in the audit event. Revocation cascades to
memberships. DNS/document challenges remain unbuilt (documents are refused
platform-wide by design).

## Posting

`/post-a-job`, auth-gated, always lands `pending` and publishes only through
staff approval; a fee cannot bypass moderation. Eligibility scope, work mode
and visa sponsorship require deliberate answers (no silent defaults), with
free-text eligibility evidence mandatory; corporate-domain assessment is
recomputed server-side. Gaps: no preview step, no country_code field (every
employer job lands country-unattributed), no employer-side close-job action.

## Speech and its limits

Verified employers may submit factual corrections and rights of reply
(rendered on the company page since 2026-08-09, labelled as the employer's
own words). Enforced boundaries: no contributor identities, no purchasable
deletion or suppression, no edits to independent-evidence fields — protected
by capability tables, RLS, a CI-pinned write-path registry, and refusal
lists that fail closed.

## Not built

Sponsored placement (partition + gates designed; no column, writer or
label), employer analytics, the five-role employer permission model
(single `representative` role today), feed/bulk posting UI.
