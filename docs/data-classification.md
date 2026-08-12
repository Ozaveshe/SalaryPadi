# Data classification

Audited against the running system on 2026-08-02. Each class below states
what was **verified**, not what was intended.

## Public

Published job facts, approved company facts, public salary aggregates,
public interview aggregates.

| Requirement | State                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------ |
| Storage     | `app.*` tables, exposed through `api.*` views with `security_invoker` + `security_barrier` |
| Access      | Anonymous read, gated by RLS and the publication provenance cache                          |
| Logging     | Not required                                                                               |
| Retention   | Lives as long as its evidence does; withdrawn when a policy review lapses                  |

A public fact carries its source, retrieval date and review-due date. When
the review window passes, the row disappears from public reads _before_
anything else notices — the window is part of the gate, not a reminder.

## Private

Saved jobs, application tracker, offers, private notes, preferences.

| Requirement | State                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------ |
| Storage     | `private.*` schema, never exposed through a public view                                    |
| Access      | RLS scoped to the authenticated user; `api.my_applications` returns only the caller's rows |
| Logging     | Access not individually logged; mutations carry `application_history`                      |
| Retention   | **Currently one fixed policy — see the gap below**                                         |

Application state is never rendered on a public surface, and the tracker now
holds an immutable snapshot of the job as the user saw it, so their history
cannot be rewritten by an employer editing the posting.

## Highly sensitive

Payslips, offer letters, verification documents, employer disputes,
identity-verification records.

| Requirement | State                                                                           |
| ----------- | ------------------------------------------------------------------------------- |
| Storage     | `private.contribution_verifications`, separated from published aggregates       |
| Access      | Moderation roles only; **unreachable from every employer role including owner** |
| Logging     | Moderation actions recorded in `private.moderation_actions`                     |
| Retention   | **Automation not yet built — see the gap below**                                |

Verification evidence never joins the public record. A contribution's
confidence may reflect that evidence existed; the evidence itself does not
travel with it.

## Verified during this audit

**Analytics cannot leak career data, structurally.** Properties are validated
against a prohibited-key pattern at the call site and then **never
transmitted**: the request body carries only `event_name` and `path`, the
server stores daily `(event, route-group)` totals, and Google Analytics
receives the event name alone. Credentials are omitted. There is no code path
by which a salary, offer, note or CV value reaches an analytics destination.

**Employers cannot reach contributor identity.**
`view_contributor_identity`, `moderate_contributions`, `edit_aggregates`,
`delete_reviews` and `alter_source_receipts` are unreachable from every
employer role, asserted separately from the capability table so that adding a
capability cannot hand one over.

**Aggregates cannot identify contributors.** Per-metric thresholds with a
24-hour publication lag, plus shape-based suppression: slices naming an
office, a team or a single month are never published at any count, and more
than two narrowing dimensions is refused regardless of cohort size.

**Free email cannot claim an employer.** Corporate-domain checking with a
free-provider blocklist already exists in `src/lib/employers/submission.ts`.

## User-controlled workspace retention

An account owner can choose "keep until I delete", "delete after 90 days" or
"delete after one year". Timed retention covers only saved jobs, application
records and their status history, and job alerts. A switch to timed retention
starts a fresh 30-day grace period. The daily maintenance worker creates an
in-app warning before the first eligible deletion and deletes only records
owned by accounts that remain opted in after grace.

The setting deliberately does not cover CV objects, contribution evidence,
moderation records, account data or public aggregates. Those records remain in
the reviewed privacy-request flow until each class has a separately tested
secure-deletion worker. Verification-document deletion is still policy rather
than automation; document verification therefore remains disabled.

The remaining gap is an explicit data-access audit log for reads of highly
sensitive records. Mutations are audited today; reads are not.
