# Moderation and support

Entry point; the runbook is
[COMPANY_INTELLIGENCE_MODERATION_RUNBOOK.md](COMPANY_INTELLIGENCE_MODERATION_RUNBOOK.md),
privacy design in [contribution-privacy.md](contribution-privacy.md).

## The database layer (complete)

Every contribution opens a moderation case. Nine automated flag detectors
run at intake (PII, doxxing, threat, hate speech, confidential material,
serious allegation, malicious text, content-hash duplicate, coordinated
campaign), with priority escalation. Every transition records actor, role,
action, reason (mandatory), previous/new state, changed fields and
before/after hashes into two append-only stores
(`private.moderation_actions`, `audit.event_log`), with compare-and-set
versioning. Escalated approvals and restores require `admin` specifically.

## The UI layer

`/admin/moderation` exposes privacy-safe flag kinds, actionable contribution
labels and measured backlog age/counts to `moderator` and `admin` roles after
AAL2. Each row opens a protected case detail with the private source record,
flag taxonomy and immutable action history, so a moderator can inspect the
material before entering a redacted public payload or another decision.

Raw detector details and user identities are not returned by the detail RPC.
Appeals still need independent-reviewer enforcement despite the runbook
requiring it, and the queue still needs configurable sub-queues.

## Support

User reports flow to `/admin/reports` (resolve / dismiss / escalate /
remove); privacy requests (export, deletion, correction) are human-fulfilled
tickets via `/privacy/requests`. There is no support-specific role or
workspace.
