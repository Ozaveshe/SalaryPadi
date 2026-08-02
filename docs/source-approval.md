# Source approval

No source publishes because it is technically reachable. Every source has an
explicit approval path and an explicit maintenance path, and both are
recorded rather than remembered.

## Priority order

Sources are pursued in this order, because it is the order that puts a
candidate closest to the employer:

1. Direct employer career pages
2. Employer ATS feeds
3. Authorised recruitment agencies
4. Licensed partners
5. Government or institutional boards where permitted
6. User-submitted employer jobs
7. Anything else, only after a rights review

The audit shows the current estate honours this: 1,820 of 1,875
destinations are an employer ATS and **zero** are an aggregator.

## Approval steps

1. **Rights review.** Confirm in writing that the licence permits the
   intended use. If it cannot be confirmed, the source is not used.
   Classification is recorded from the vocabulary in
   [`source-rights.md`](./source-rights.md).
2. **Probe real data.** Locations, posting dates, and whether the tenant is
   the company you think it is. Wrong-company tenants and dormant boards are
   rejected here, before registration.
3. **Register as draft**, then configure, then re-review. Inserting a config
   deliberately revokes the authorization review and pauses the source; that
   is the system working.
4. **Activate**, grant country rights, and record evidence dependencies.
5. **Confirm** with `security.authorized_ats_source_config_rows()`.

## Maintenance

Every source carries a `policy_review_due_at`. An overdue source disappears
from public reads before anything else notices, because the review window is
part of the publication gate rather than a reminder.

Re-running the coverage audit is the maintenance check for the estate as a
whole: it surfaces concentration, staleness and apply-link failures that no
single source's health check would show.

## Sources that stay disabled

SmartRecruiters, Jooble, Remotive and ReliefWeb are disabled for recorded
reasons documented in [`source-rights.md`](./source-rights.md). None may be
re-enabled to raise a job count. Re-enabling requires a completed rights
review recorded in the registry and the policy matrix — the same path a new
source takes.
