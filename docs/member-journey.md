# Member journey

Entry point; depth in [user-journeys.md](user-journeys.md) and
[application-tracker.md](application-tracker.md).

## What works end to end (2026-08-09)

- Save jobs, track applications (7 states), attach a CV version, one
  next-action date per application read on the WAT calendar, private notes.
- Since `20260809120000` the tracker renders the **snapshot of the job as
  the member saw it when applying** and names what changed since; external
  applications had their own snapshot table already.
- Alerts: daily/weekly email with strict source-level email rights, canonical
  dedupe, saved full search spec; pause = disable. Notifications: read
  state, per-kind email preference, `action_due` and `application_stalled`
  produced.
- Job context carries into all four tools (`?from=…`, whitelisted and
  validated); sub-monthly pay periods travel for Offer Compare but never
  prefill the monthly/annual calculators.

## Honest gaps

- **Guests have no persistence**: no local saves, no recent searches, no
  temporary workspace — so there is nothing to migrate at sign-up. Building
  guest state, its limits and the merge is one piece of work.
- Offer workspace is stateless: no saved offers, no scenarios, no link from
  tracker to Offer Compare, no export.
- Three advertised notification kinds (`new_match`, `saved_job_aging`,
  `alert_digest`) are toggles for events nothing produces; alerts have no
  immediate frequency and ignore `profiles.time_zone` for send hour.
- No saved searches without an alert, no follow-employer, no user-controlled
  retention (see [privacy-and-retention.md](privacy-and-retention.md)).
