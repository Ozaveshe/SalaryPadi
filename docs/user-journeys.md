# SalaryPadi user journeys

The product is organised around one sequence. Every surface exists to serve a
step in it, and every step must hand off to the next without the user feeling
they have left SalaryPadi.

## The core journey

| #   | Step                                   | Where it happens                                     | Hand-off carried forward                                  |
| --- | -------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| 1   | Discover a relevant job                | `/jobs`, `/jobs/nigeria`, `/jobs/remote`, `/matches` | Search terms and filters persist in the URL               |
| 2   | Confirm they can actually apply        | `/jobs/[slug]` eligibility evidence                  | Eligibility wording, never inferred                       |
| 3   | Understand role, employer, salary      | `/jobs/[slug]`, `/companies/[slug]`, `/salaries`     | Employer link keeps the role in view                      |
| 4   | Check take-home or compare pay         | `/tools/take-home-pay`, `/tools/offer-compare`       | **Job context: role, employer, amount, currency, period** |
| 5   | Apply through the verified destination | Job detail apply action                              | Destination host is policy-pinned                         |
| 6   | Save and track                         | `/saved`, `/applications`                            | Saved job becomes a tracker row                           |
| 7   | Record interviews and offers           | `/applications`                                      | Application becomes interview/offer evidence              |
| 8   | Compare an offer                       | `/tools/offer-compare`                               | Offer prefills from the tracked application               |
| 9   | Contribute what they learned           | `/contribute/*`                                      | Employer and role prefill from context                    |
| 10  | Get better alerts and matches          | `/alerts`, `/matches`                                | Saved searches and profile signals                        |

Steps 1–5 and 9 require no account. Steps 6–8 and 10 are what an account buys.

## Journey A — "Can I even apply for this?"

The defining Nigerian job-seeker problem: most listings on most boards are not
open to them, and the listing rarely says so plainly.

1. Lands on `/jobs` from search or the homepage.
2. Filters by eligibility — Nigeria explicitly eligible is the default posture.
3. Opens a job. The detail page states the eligibility evidence in the
   source's own words, and says **"eligibility not resolved from the
   posting"** when the wording does not settle it — never the bare label
   "Unclear", which is prohibited public vocabulary. A bare "Remote" never
   becomes "open to Nigeria".
4. Follows the verified application destination.

The honesty of step 3 is the product. A confident wrong answer here costs
someone an afternoon and their morale.

## Journey B — "What is this actually worth?"

Where the old page-shaped product broke down most visibly.

1. On a job advertising ₦600,000–₦700,000/month, the user opens
   **Estimate take-home pay**.
2. The calculator opens **already carrying the role, the employer and
   ₦600,000/month**, with a banner naming the job and a link back to it.
3. They calculate PAYE, then move to **Compare an offer** — which prefills
   Offer A as `Senior Analyst — Moniepoint` at the same figure.
4. They add their current offer as Offer B and compare.

Before this work, steps 2 and 3 both opened empty forms on a page that looked
like a separate calculator product. The user had to retype numbers that were
displayed on the page they had just left.

**Deliberate exception:** a role advertised in USD does not prefill the naira
PAYE calculator. The page explains why and links to the converter. Carrying
the figure would produce a Nigerian tax result for a salary that is not
Nigerian pay — technically a filled form, factually a lie.

## Journey C — "Who is this employer?"

1. From a job, **Inspect company evidence** keeps the role in view.
2. The company profile shows regulator status (naming the exact licensed
   entity), open roles, salary evidence, interview reports and benefits.
3. Gaps are visible as gaps. An employer with no salary evidence shows an
   empty state saying so, never an estimate.
4. The user returns to the role, or applies from the employer's open jobs.

## Journey D — "Where am I up to?"

1. Saved jobs accumulate signed-out intent into one place once the user
   registers.
2. Applying marks the job as applied in the tracker.
3. Interviews and offers are recorded against the application.
4. A recorded offer opens directly in Offer Compare.
5. After the outcome, the user is invited to contribute salary, interview or
   pay-reliability evidence — the loop that makes the next person's Journey A
   and B better.

This is the loop that makes SalaryPadi compound: contributions come from users
who already got value, not from a cold ask.

## Journey E — "Is this a scam?"

High-urgency, entirely signed-out.

1. User pastes a suspicious vacancy into `/tools/job-scam-checker`.
2. They get explainable flags without uploading the vacancy anywhere.
3. From there they can search real, source-attributed roles.

Requiring registration at this moment would fail the person the product exists
for. This is why the Pay & Offers surface is asserted account-free in tests.

## Mobile

Mobile is the primary case, not a narrow desktop. Journeys A and B must be
completable one-handed: compact job cards, salary and eligibility legible
without expanding anything, save and apply reachable by thumb, and no
diagnostic panel large enough to push the decision below the fold.
