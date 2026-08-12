# Product analytics

Entry point; metric definitions in [product-metrics.md](product-metrics.md).

## The taxonomy

One catalog (`src/lib/analytics/catalog.ts`): 16 event names and the route
groups the server aggregates by. The wire format is `{event_name, path}` and
nothing else — properties are validated at the call site and deliberately
never transmitted (test-pinned); the server stores daily event ×
route-group totals after checking consent; Google receives the event name
alone.

## What fires (since 2026-08-09)

- `page_view` (consent-gated), `tool_started`, `tool_completed` (the three
  originals).
- `outbound_apply_click`, `job_saved`, `application_created`,
  `alert_created` via one delegated `data-event` click listener.
- `job_view`, `company_view`, `job_search`, `job_filter_applied`,
  `salary_search` via `TrackView` rendered by the owning pages.

The remaining catalog events now fire at bounded milestones:
`application_status_changed` after the update RPC succeeds,
`contribution_started` when a protected contribution form opens,
`contribution_submitted` after the submission RPC succeeds, and
`content_reported` after a report is accepted. Failed redirects do not count
as successful mutations.

## The north-star gap

"Verified eligible application clicks per active job seeker" needs
qualifying dimensions (eligibility state, verification state, canonical id,
per-session dedupe) that the deliberately minimal wire format cannot carry.
Measuring it properly requires a designed, privacy-reviewed schema extension
— counting `outbound_apply_click` by route group is the available proxy
until then. Do not widen the wire format casually: the minimalism is the
privacy control.
