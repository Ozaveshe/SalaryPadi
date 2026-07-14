# First-Party Company Intelligence Acquisition Pilot

No production contribution baseline exists, so this is a measurable planning target, not a forecast or public promise.

## Ninety-day target

- 100 completed first-party submissions across salary, review, benefits, pay reliability and interview flows;
- at least 70 approved independent contributions after moderation and duplicate/campaign review;
- at least 5 companies reaching the five-review threshold for an overall rating;
- at least 10 salary cells reaching their configured privacy cohort;
- at least 10 benefit or pay-reliability cells reaching five independent contributors;
- zero paid or in-kind incentives, zero outbound messages from this implementation, and zero third-party review imports.

Review the funnel after 30 days. If fewer than 10 eligible submissions exist, improve the in-product explanation and completion flow; do not weaken moderation, privacy thresholds or independence rules.

## Implemented hooks

Neutral contribution invitations appear after a salary calculation, application tracking, interview or offer status, and job-alert creation. Company pages have shareable canonical links and contribution paths. The hooks describe the requested evidence, privacy cohort and first-party boundary. They do not imply a reward or verification outcome.

## Approved neutral templates

**After a calculator result**

“If this calculation helped, you can privately add your own original pay evidence for a moderated cohort.”

**After tracking an application**

“After applying, you can share only your own interview process or offer evidence. Do not include confidential answers.”

**After an interview**

“When your interview is complete, a structured first-party account can help the next applicant understand the process.”

**After an offer**

“If you received an offer, preserve the original currency, period and gross or net basis in a private salary contribution.”

**After creating an alert**

“Job alerts find openings; first-party contributions help applicants evaluate the employer after they engage.”

The repository does not send these templates. Any outbound campaign needs separate consent, frequency, suppression, sender-identity, deliverability and privacy approval.

## Pilot measurement

Measure views of an eligible in-product hook, form starts, private drafts, submissions, revisions, approvals, rejections by code, median moderation time, duplicates/campaign flags, deletion requests and cohort releases. Keep analytics aggregate-only and never send salary, narrative, company claim, account identity or moderation content to analytics.

The dashboard must distinguish raw submissions, approved independent contributions and public aggregates. A submission is not a verified review, and a five-row cohort is not necessarily five independent contributors until the moderation and abuse checks agree.
