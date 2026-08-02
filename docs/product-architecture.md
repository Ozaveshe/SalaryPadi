# SalaryPadi product architecture

SalaryPadi is a career-decision platform, not a job board. A job board ends at
the apply button. SalaryPadi's job is to carry someone from "is there a role
for me?" all the way to "is this offer worth taking, and what happened after I
applied?" — without the person ever feeling handed off to a different product.

The breadth was never the problem. The problem was that capabilities were
addressed as pages, so a user moving from a vacancy to a pay calculation
started again from an empty form.

## The four surfaces

Every consumer route belongs to exactly one surface. The single source of
truth is [`src/lib/product/surfaces.ts`](../src/lib/product/surfaces.ts); the
header, the mobile drawer and the navigation tests all read from it, so a
destination cannot exist in one navigation and be missing from another.

| Surface          | Question it answers                         | Entry route  |
| ---------------- | ------------------------------------------- | ------------ |
| **Jobs**         | What can I actually apply for?              | `/jobs`      |
| **Companies**    | Who is this employer, really?               | `/companies` |
| **Pay & Offers** | What is this worth, and what would I keep?  | `/salaries`  |
| **My Career**    | What have I saved, applied to, and learned? | `/dashboard` |

Four is a deliberate ceiling. The previous header carried six entries and
still could not express the product: `Salaries` and `Tools` were separate
items even though nobody thinking about money distinguishes "the salary page"
from "the salary calculator", and `Contribute` sat as a peer of the entire
jobs catalogue. Grouping is not hiding — each surface landing page lists
everything inside it via `SurfaceLinks`.

### Why these four and not the obvious alternatives

- **Not by content type** (jobs / companies / salaries / tools / articles).
  That is a sitemap, not a journey; it is exactly what produced six header
  items and a user who has to know which noun holds the calculator.
- **Not by funnel stage** (discover / evaluate / apply / track). Users do not
  arrive at stage one. Someone with an offer in hand enters at Pay & Offers,
  and a stage-named navigation makes that feel like skipping ahead.
- **By the question in the user's head.** "What can I apply for", "who are
  they", "what is it worth", "where am I up to". Each surface owns one.

## Account boundary

Browsing, evidence inspection and every pay tool work signed out. An account
buys **persistence**, not access: saved jobs, application tracking, alerts,
recommendations and contributions history. This is enforced by a test — the
Pay & Offers surface may not contain a single `requiresAccount` destination.

The reason is market-specific: a Nigerian job seeker on a metered connection
evaluating a suspicious vacancy must be able to run the scam checker
immediately. A registration wall at that moment is a product that failed the
person it exists for.

## Context preservation

This is the mechanism that turns pages into a journey, implemented in
[`src/lib/product/job-context.ts`](../src/lib/product/job-context.ts).

When a user moves from a job into a pay tool, a whitelisted set of facts
travels with them in the query string:

```
/tools/take-home-pay?from=<slug>&role=…&employer=…&employerSlug=…
                     &amount=600000&currency=NGN&period=monthly
```

The receiving page prefills the calculation and renders a `JobContextBanner`
naming the role, linking to the employer, and offering an explicit route back
to the job. The user is still inside the same decision.

Three rules govern what travels:

1. **Only facts already public on the job page.** No identifiers, no account
   state, nothing a signed-out visitor could not already read.
2. **A range prefills its lower bound.** Advertised bands are not offers;
   seeding the top figure would overstate what someone is likely to be paid.
3. **Every field is validated on the way back in.** A slug that is not a slug
   never becomes a link; a non-finite amount never reaches a calculator. These
   values are rendered and used as form defaults, so they are treated as
   untrusted input.

Currency has a specific carve-out: a role advertised in USD prefills nothing
into the Nigeria PAYE calculator, because a naira tax result computed on a
dollar figure would be a false statement about that job. The page says so and
points to the converter instead.

## AfroTools

AfroTools is calculation infrastructure, not a destination. The tools already
live at SalaryPadi routes (`/tools/*`) calling SalaryPadi APIs
(`/api/tools/*`), which in turn call AfroTools. Users keep their job context,
their application state and their analytics attribution throughout. Provider
attribution stays visible where a calculation depends on it — the consent
lines on each tool name AfroTools explicitly — because the provenance rule
applies to computation as much as to data.

## Positioning

One hierarchy, everywhere:

> Built first for Nigerian job seekers, with verified opportunities across
> Africa and global remote work.

Nigeria is the primary market. Africa is not treated as one labour market:
eligibility, salary, tax, currency and employment terms stay country-specific,
which is why `nigeriaValueTier` orders browse surfaces and why country packs
gate what may be published for a given market.

## What consumer surfaces must never expose

Ingestion and engineering vocabulary is not consumer content. Words like
_adapter_, _canonical_, _occurrence_, _provenance cache_, _source policy_,
_RPC_ and _feed state_ belong in `/admin` and in this repository, not on a
page a job seeker reads. Surface summaries are asserted against this in
`surfaces.test.ts`.

The user-facing equivalents are defined in
[`product-state-glossary.md`](./product-state-glossary.md).
