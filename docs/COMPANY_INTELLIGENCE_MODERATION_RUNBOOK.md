# Company Intelligence Moderation Runbook

This runbook covers first-party workplace reviews, salaries, benefits, pay reliability, interview experiences, company claims, employer responses and reports. It never authorizes importing or transforming third-party community material.

## Non-negotiable boundary

Approve only a contributor's own original account or a cited factual employer record. Reject copied, quoted, summarized, paraphrased, AI-rewritten or translated third-party reviews, ratings, salaries, interview reports or community posts. Do not use external review sites to corroborate or rewrite a submission.

Do not ask for or accept payslips, identity documents, screenshots, attachments or work-email evidence. `document_verified_later` remains disabled until the separate secure-design review listed in the privacy notes is complete.

## Queue order

1. Emergency exposed personal data, credible threat or imminent safety concern.
2. Doxxing, hate, confidential information or serious allegations.
3. Coordinated campaigns, employer brigading, salary manipulation and duplicates.
4. Employer claims and factual corrections.
5. Routine first-party contributions.

Automatic rules add codes only: PII, doxxing, threat, hate speech, duplicate, coordinated campaign, confidential material, serious allegation and malicious text. Network abuse evidence is a daily HMAC; raw addresses are discarded. A flag is a review signal, never an automatic truth or automatic publication decision.

## Reviewer checklist

1. Claim the case and confirm the expected version. A stale version must be reloaded, not overwritten.
2. Check the origin attestation. If the user says the material came from another site, reject it without copying that source into notes.
3. Check company and country/office normalization. Do not infer a legal entity from a brand name.
4. Inspect for private names, emails, phone numbers, addresses, identifiers, confidential answers, passwords or re-identification combinations.
5. Check allegation risk. Separate a directly observed employment condition from a conclusion about criminality, intent or motive.
6. Check duplication and campaign signals across account, content hash, time window and coarse daily network key. Never expose those signals to an employer.
7. Confirm structured values agree with the permitted narrative and that a salary preserves currency, period, gross/net basis and source value.
8. Choose one audited action and record a minimum-necessary reason code. Do not paste sensitive text into the reason.

## Actions

| Action             | Use                                                                             | Required result                                                                    |
| ------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `approve`          | First-party, relevant and safe                                                  | Publish only the approved/redacted payload or queue its cohort aggregate           |
| `redact`           | Limited PII/confidential fragment can be removed without changing meaning       | Record fields redacted; retain original privately under the retention policy       |
| `request_revision` | Contributor can safely clarify or remove risky material                         | No public record; explain the exact category, not another person's identity        |
| `reject`           | Copied source, unverifiable origin, unsafe content, spam or unsuitable material | No public record; preserve immutable decision metadata                             |
| `escalate`         | Serious allegation, credible threat, legal uncertainty or incident              | Freeze publication and route to the named safety/privacy/legal owner               |
| `remove`           | Published material must leave public surfaces                                   | Remove publication immediately; queue aggregate recomputation                      |
| `restore`          | Prior removal was reversed after reviewed appeal                                | Admin-only; restore only the last approved public payload and recompute aggregates |

`merge_duplicate` applies only to duplicate submissions from the same contributor or a reviewed duplicate campaign. It must not turn several coordinated records into independent evidence.

## Serious allegations and emergency content

- Do not investigate guilt or rewrite the allegation as fact.
- Remove exposed PII from public surfaces immediately.
- Escalate credible threats or imminent harm to the designated incident owner using the private incident process. Do not contact the employer or subject from this task flow.
- For potentially defamatory or confidential claims, keep the item unpublished until qualified review. A neutral request for revision may ask for directly observed facts without demanding documents.
- Audit notes use stable codes and minimal facts. Never reproduce the full allegation in an alert or external ticket.

## Employer claims and responses

A corporate-domain match only opens a private claim for human review. Verify the domain against a cited official domain and independently confirm the claimant's relationship and authority. Claim evidence remains private.

A verified claimant may submit a factual correction or right of reply. The response is moderated and labelled as employer speech. The public response contains no claimant identity, account ID or work email. Employers cannot read contributor identity or abuse signals, edit a community publication, or change rating and salary aggregates.

## Reports, correction, appeal, takedown and deletion

- User or employer reports create a private moderation case with target type and minimum-necessary narrative.
- A correction changes a cited fact only when a new allowed citation supports it; supersede the old citation rather than silently rewriting history.
- An appeal is reviewed by someone other than the original moderator when staffing permits. Use the current record version.
- Takedown removes the public publication promptly while the review continues when identity or safety risk is plausible.
- A deletion request removes or de-identifies the contributor-facing record and queues all affected aggregates for recomputation. Preserve only the narrowly documented audit/legal/abuse tombstone allowed by the retention decision.
- Restore is admin-only and creates another immutable action; it never erases the removal event.

## Aggregate integrity

- Count the latest approved contribution per independent contributor in a cohort.
- Do not treat multiple accounts, coordinated submissions or employer-directed campaigns as independent.
- Overall ratings require at least five approved independent reviews.
- Salary cells use the active configured privacy rule. Benefits and pay reliability require at least five independent approved contributors.
- Always expose sample size, country/office, date range, verification mix and confidence.
- A removal, deletion, verification revocation or discovered campaign must queue recomputation before the aggregate can be trusted again.

## Daily operations

Review emergency/escalated queues first, then queue age and cohort refresh failures. Confirm all moderator actions were written to `private.moderation_actions` and `audit.event_log`. Review duplicate/coordinated-campaign clusters without joining raw network data to public identity. Record unresolved staffing or legal ownership as a blocker; do not lower the publication standard to clear a queue.
