# Company Intelligence Privacy and Retention Notes

Status: implementation contract requiring privacy, security and legal owner approval before production activation.

## Data separation

Public records contain cited company facts, privacy-cohort aggregates, moderated first-party publications and labelled employer responses. They never contain contributor account ID, claimant identity, work email, verification evidence, abuse keys or moderation-only payloads.

Individual review pages remain unavailable until five independent approved contributors exist for the company. Interview accounts require three. Rare role and country dimensions are withheld below a three-person subgroup; individual employment period, employment status, interview application source, seniority, feedback and outcome are suppressed to reduce reviewer re-identification.

Private identity is held in the contributor or claimant record. Verification level and evidence reference are separate. Abuse signals contain a daily network HMAC and content hash, not a raw IP address. Moderation cases and actions are staff-only. RLS is enforced in addition to API checks.

## Implemented hard limits

| Data                       | Limit or state                         | Enforcement                                                       |
| -------------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| Private contribution draft | Up to 90 days                          | Database constraint, owner-only RLS, expiry timestamp, delete RPC |
| Coarse abuse signal        | Up to 30 days                          | Database constraint; daily HMAC; raw address discarded            |
| Analytics daily aggregate  | 90 days                                | Existing operations policy                                        |
| Payslip/document           | Not accepted                           | Form, API, draft RPC and verification trigger                     |
| Work-domain verification   | Private                                | Human-reviewed claim; absent from public views                    |
| Public aggregate           | Only after active cohort and lag rules | Security-invoker views and snapshot release state                 |

The existing retention worker must be extended and verified against `private.contribution_drafts` and `private.contribution_abuse_signals` before production activation. A schema constraint bounds the expiry timestamp; it is not evidence that deletion automation ran.

## Decisions required before launch

The privacy, security and legal owners must approve exact retention for raw approved, rejected, revision-requested and removed contributions; employer claims/responses; reports; moderation cases; immutable action metadata; backups; legal holds; exports; incident evidence; and de-identified aggregate inputs. Until those decisions are recorded, do not claim automatic erasure beyond the hard draft/abuse expiry bounds.

Recommended operating posture for review, subject to approval:

- rejected or abandoned raw contribution: delete content after 180 days unless appeal, safety incident or legal hold is active;
- approved contribution: retain while published or aggregated, then remove content after withdrawal/deletion and recomputation, preserving a text-free audit tombstone where required;
- moderation action metadata: retain for 24 months for audit integrity, without copied sensitive narrative;
- reports and appeals: retain 24 months after closure unless a shorter statutory requirement applies;
- backups: document propagation delay and verify deletion during restore drills;
- legal hold: named owner, reason, scope, review date and release action; never an indefinite unlabeled flag.

These are proposals, not configured production facts.

## Deletion workflow

1. Authenticate and verify ownership without exposing identity to an employer.
2. Freeze the affected publication and aggregates if continued release creates privacy risk.
3. Remove the public record and search/cache representations.
4. Delete or de-identify private content according to the approved retention rule.
5. Queue company rating, salary, benefit and pay-reliability recomputation.
6. Retain only a stable record ID, action, reason code, actor role, timestamps, state transition and content hash if the approved policy requires audit integrity.
7. Record backup propagation and any legal hold in the private case.
8. Confirm completion to the requester without identifying other contributors or disclosing cohort membership.

## Why payslips remain disabled

Document verification cannot be enabled until all of the following are implemented and independently reviewed:

- client and server redaction that cannot preserve hidden layers or metadata;
- field-level encryption with managed key rotation and separation of duties;
- private object storage with deny-by-default access and short signed URLs;
- malware scanning and safe rendering without active content;
- explicit purpose, consent and data-minimization rules;
- retention, deletion, backup propagation and legal-hold automation;
- access logging, periodic access review and break-glass controls;
- incident classification, containment, notification and evidence handling;
- subject-access/export handling and cross-border processing review;
- adversarial tests for ID numbers, bank details, QR codes, images, metadata and redaction failure.

No payslip field, object URL or document blob exists in the prepared company-intelligence schema.

## Incident response

If private identity or evidence appears in a public response, page, cache, log, analytics event or alert: remove access, preserve minimal audit evidence, invalidate affected caches/tokens, determine the exact records and viewers, notify the named incident/privacy owner, evaluate statutory notification with qualified counsel, and document corrective actions. Do not copy the leaked material into issue trackers or chat.
