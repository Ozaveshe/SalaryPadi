# Application tracker

## The record must not rewrite itself

`private.applications` stored only `job_id`, so every tracked application
rendered from the **live** job row. When an employer retitles a role, changes
the advertised pay, or the posting is purged, the user's own history changed
underneath them — and they are the one person who cannot be wrong about what
they applied to.

Columns and module shipped in
`supabase/migrations/20260802120000_application_job_snapshot.sql` and
[`src/lib/career/application-snapshot.ts`](../src/lib/career/application-snapshot.ts) —
but nothing wrote or read them until
`supabase/migrations/20260809120000_application_snapshot_capture.sql` completed
the write path (capture once in `upsert_application`) and the read path
(`get_my_applications` returns the snapshot; the tracker renders it and names
what changed since). That migration is deploy-coupled: apply it WITH the build
that ships the widened application schema.

## What a snapshot holds

Captured once, at the moment the application is recorded, and never updated:

| Field                                                  | Why it is kept                                          |
| ------------------------------------------------------ | ------------------------------------------------------- |
| `jobId`                                                | Canonical id, so a slug change cannot orphan the record |
| `title`, `companyName`, `companySlug`                  | What they applied to                                    |
| `locationDisplay`, `workArrangement`, `employmentType` | The terms as shown                                      |
| `salaryDisplay`                                        | The pay **exactly as displayed**, or null               |
| `applicationUrl`                                       | Where Apply actually sent them                          |
| `eligibilitySummary`                                   | What the page said about applying from Nigeria          |
| `lastCheckedAt`                                        | How fresh the job was when they acted on it             |

**An absent salary is stored as null, not omitted.** "The posting did not
state pay" is part of what the person saw and is worth preserving — it is
often exactly what they want to remember when an offer arrives.

## The live job may change; the record may not

`resolveApplicationDisplay()` always renders the snapshot. The live job is
consulted only to _notice_ a difference and mention it:

> The role title has changed since you applied.

Someone who applied to "Senior Analyst at ₦600,000" still sees that, plus a
note that the posting has since been retitled. They are never shown new text
in place of what they remember.

If the live job is gone entirely, the record still renders in full.

## Failure behaviour

| Situation                         | Result                                            |
| --------------------------------- | ------------------------------------------------- |
| Snapshot present and valid        | Rendered, `fromSnapshot: true`                    |
| Recorded before snapshots existed | Falls back to the live job, `fromSnapshot: false` |
| Snapshot malformed                | Treated as **invalid**, not repaired              |
| No snapshot and no live job       | Nothing rendered rather than a fabricated row     |

A malformed snapshot is never silently patched with live job data — that
would recreate the exact problem snapshots exist to solve.

## Job closure is separate

Closure lives on the live job, not on the application. A role can show as
closed _today_ without disturbing what was true when the person applied, so
"this job has since closed" and "you applied to this on 2 August" are two
independent facts rather than one overwriting the other.

## Privacy

Application state is private by default and never appears on a public
surface. `api.my_applications` is scoped to the authenticated user, and no
part of an application — status, notes, snapshot or offer figures — is
exposed publicly or sent to marketing analytics.

## Still to build

- The status enum is `saved | applied | assessment | interview | offer |
rejected | withdrawn`. The wider set (interested, preparing, screening,
  accepted, closed, archived) needs the enum widened **together with** the
  read-path handling — widening it alone is the contract-coupling failure
  that has broken this repo before.
- Configurable retention per data type, replacing the single fixed policy.
- Guest-to-account migration for locally saved jobs.
