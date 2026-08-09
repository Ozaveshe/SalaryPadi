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

## The UI layer (the gap)

`/admin/moderation` renders one flat table that shows **none** of the flag
signals, has no sub-queues, no case detail view (redaction means hand-typed
JSON), and labels benefits/pay-reliability cases with the bare string
"Moderation case". Appeals have no independent-reviewer enforcement despite
the runbook requiring one, and no backlog-age metric exists though the
runbook's daily routine depends on it. Only `admin` role holders can reach
the queue at all.

## Support

User reports flow to `/admin/reports` (resolve / dismiss / escalate /
remove); privacy requests (export, deletion, correction) are human-fulfilled
tickets via `/privacy/requests`. There is no support-specific role or
workspace.
