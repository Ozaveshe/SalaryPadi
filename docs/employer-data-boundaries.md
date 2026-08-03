# Employer data boundaries

SalaryPadi sells employers real things — distribution, integrations,
analytics, branded content. It must never sell the thing that makes any of
them worth reading: that eligibility, salary and reliability evidence is
independent of whoever is paying.

Implemented in
[`src/lib/employers/data-boundaries.ts`](../src/lib/employers/data-boundaries.ts).

## Why this is code and not a policy page

"Can the employer edit this?" is exactly the question that gets answered
wrongly under commercial pressure, one field at a time, by whoever is
building the next admin screen. Expressing the boundary as data with a stored
reason means the argument has to be had against a test rather than in a
sales call.

Both checks **fail closed**: an unclassified field is not editable, and an
unclassified commercial idea is not sellable until someone classifies it.

## What a verified employer may edit

`company_description`, `careers_information`, `locations`,
`benefits_statement`, `hiring_process`, `work_model`, `contact_channel`,
`careers_links`, `brand_assets`, `response_statement`.

Everything an employer writes is labelled **employer-provided**. Typing
something does not promote it to a SalaryPadi-verified fact.

## What no employer may edit

| Field                       | Reason                                                           |
| --------------------------- | ---------------------------------------------------------------- |
| `salary_aggregate`          | Editing it would make the figure an employer claim               |
| `pay_reliability_aggregate` | The evidence most damaging to suppress and most valuable to keep |
| `review_aggregate`          | Employers may respond to themes; not alter them                  |
| `review_order`              | Reordering reviews is suppression with extra steps               |
| `interview_aggregate`       | Candidates' account of their own experience                      |
| `eligibility_evidence`      | Read from the posting's wording, not from preference             |
| `salary_confidence`         | A property of the evidence, not the account                      |
| `verification_badge`        | A badge means we checked something                               |
| `regulator_status`          | An employer cannot edit a regulator's record                     |
| `organic_rank`              | Placement is for sale; organic order is not                      |
| `source_receipt`            | Immutable; not editable by anyone                                |
| `contribution_content`      | A user's own words                                               |

Protected fields carry a **dispute path**, not an edit path: an employer may
challenge a specific record through a documented process that SalaryPadi
reviews.

## What money cannot buy

Purchasable: job distribution, featured placement, ATS integration, profile
tools, applicant analytics, recruitment workflow, job-description support,
salary benchmarking, branded content.

Not for sale, with the reason kept next to the rule because each has a
plausible-sounding commercial argument attached:

| Item                         | Why not                                                               |
| ---------------------------- | --------------------------------------------------------------------- |
| Eligibility verification     | Comes from evidence in the posting, not a purchase                    |
| Verification badge           | Verification is earned by passing a check; the check _is_ the product |
| Negative-information removal | Valid evidence is not removable at any price                          |
| Salary-confidence boost      | Confidence is a property of the evidence                              |
| Review reordering            | Not a commercial surface                                              |
| Pay-reliability suppression  | The single most harmful thing money could buy here                    |
| Organic ranking              | Placement is purchasable and labelled Sponsored; ranking is not       |

## Roles

| Role              | Capabilities                                                        |
| ----------------- | ------------------------------------------------------------------- |
| Owner             | Post/close jobs, edit profile, analytics, billing, members, respond |
| Recruiter         | Post/close jobs, analytics                                          |
| Analyst           | Analytics                                                           |
| Profile editor    | Edit profile, respond                                               |
| **Billing admin** | **Billing only**                                                    |

Billing deliberately grants nothing over jobs, profile or analytics: the
person who pays should not thereby gain reach into the content.

## Moderation is outside every role

`moderate_contributions`, `edit_aggregates`, `view_contributor_identity`,
`delete_reviews` and `alter_source_receipts` are unreachable from **any**
employer role, owner included. This is asserted separately from the
capability table so that adding a capability cannot accidentally hand one
over.

## Still to build

- Wiring these checks into the employer admin write path, which currently
  enforces its own rules.
- The DNS-challenge verification method (corporate-domain email and free-email
  rejection already exist in `src/lib/employers/submission.ts`).
- Employer analytics aggregation thresholds.
