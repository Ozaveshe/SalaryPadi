# Job lifecycle

A listing is a claim about the world that decays. The lifecycle exists to
stop two opposite failures: showing a job that closed weeks ago, and closing
a job because a network request timed out.

## States

`app.jobs.lifecycle_state` carries the ingestion-facing state; `status`,
`apply_link_state` and the source's own policy carry the rest.

| State      | Meaning                                               | Visible?                       |
| ---------- | ----------------------------------------------------- | ------------------------------ |
| `open`     | Seen in the most recent successful snapshot           | Yes, if rights and packs allow |
| `checking` | Absent from one successful snapshot — possibly closed | Yes, with freshness caveat     |
| `closed`   | Confirmed gone, or past its stated deadline           | No                             |

Alongside these, a record may be withheld for reasons that are not lifecycle
at all: `rights_blocked` (source rights forbid publication), held pending a
country pack, quarantined by a policy filter, or awaiting duplicate review.
These are deliberately separate from lifecycle so that "we may not show this"
is never confused with "this job ended."

## Absence evidence: the rule that prevents false closures

**A source timeout is not proof that a job is closed.**

- Only a **fully successful** snapshot can contribute absence evidence.
- Partial, failed, timed-out, HTTP 403 and HTTP 429 outcomes never advance
  absence evidence and never close a job.
- The first successful omission moves the job to `checking`.
- A second successful omission closes it, and only when at least 30 minutes
  have passed since the first — so two rapid ticks cannot close a job.
- Seeing the occurrence again resets absence evidence and returns it to
  `open`.

This is why a rate-limited provider cannot silently empty the board. The
worst a broken source can do is leave jobs where they are.

## The opposite failure: indefinite listings

A job with no stated closing date must not stay `open` forever. Direct and
manual jobs close after 30 days without reconfirmation. Source-provided
deadlines close the job on the next lifecycle run after they pass.

Ageing beyond that (decay, hardening, withdrawal by age) is implemented but
deliberately held: it is a pure function of `posted_at`, and until every
board reports real publication dates it would withdraw jobs based on
ingestion dates rather than real age. That gate is documented in the pull
request that holds it.

## Freshness is per source

Each source has its own reviewed refresh interval and daily request budget —
some boards permit four requests a day, others hourly. Freshness policy
follows the source's terms, not a global timer, and a source that has not
been checked within its own interval is reported as stale rather than assumed
current.

## Application destinations

A changed or broken apply link must not silently remain the primary
destination.

- `audit.job_apply_link_checks` records every check: result, HTTP status,
  response time, destination host.
- `app.jobs.apply_link_state` carries the current verdict: `unchecked`,
  `healthy`, `broken`, `indeterminate`.
- `app.jobs.application_destination_kind` records **what kind** of destination
  it is, so the preferred-destination rule can be evaluated in data.

### Preferred destination

Implemented in
[`src/lib/canonical/application-destination.ts`](../src/lib/canonical/application-destination.ts):

```
direct_employer > employer_ats > agency > email > external_board > aggregator
```

Two rules qualify it:

- **A broken link never wins**, however direct it is. Sending someone to a
  dead employer page is worse than sending them to a working listing.
- **When every candidate is broken, nothing wins.** The function returns null
  so the caller withdraws the apply action rather than offering a dead link.

Classification is deterministic: destination host against verified employer
domains first, then a fixed ATS host table, then a fixed aggregator table.
An unknown host is reported as `external_board` with `deterministic: false`
so it never wins a comparison on the strength of a guess.

## Status events

`audit.canonical_job_events` records lifecycle transitions, so a job's history
is reconstructable: when it opened, when absence evidence accrued, when it
closed and why.

## Verified state (2026-08-01)

| Figure                                 | Value |
| -------------------------------------- | ----- |
| Jobs with a broken apply link          | 0     |
| Jobs with an unchecked destination     | 4     |
| Jobs with no recorded destination kind | 1,874 |

The last row is the current gap: destination typing shipped in this change,
so no job carries a kind yet. Until the classifier is run across the estate,
the preferred-destination rule is available but not yet applied to live rows.
That backfill is the immediate next step, and it is a read-and-classify pass
over existing data — it invents nothing.
