# SalaryPadi product state glossary

One vocabulary for every surface. A job card, a job page, a company profile, a
search filter and an alert email must describe the same state with the same
words, or the user learns that the words mean nothing.

This glossary is enforced, not advisory. The presentation boundary in
[`src/lib/presentation/public-field.ts`](../src/lib/presentation/public-field.ts)
converts internal uncertainty into public language, and
`prohibited-labels.test.ts` renders public components against uncertain
fixtures and fails if a prohibited label reaches the output.

## The rule that outranks the rest

**Internal uncertainty states are never printed as public labels.**

The database deliberately records `unknown`, `unclear`, `unspecified`,
`not_stated` and `none`. Those are engineering states. A public field is
either:

1. presented as a **known value**, or
2. presented as a **specific absence statement** that tells the user something
   useful, or
3. **omitted entirely**.

A label that merely announces our ignorance ("Unknown", "Unclear", "N/A") is
worse than an omission: it occupies the space where an answer should be and
tells the reader nothing they can act on.

### Prohibited as public labels

`Unknown` · `Unclear` · `unclear` · `Not stated` · `None applied` · `null` ·
`N/A` · `Deterministic coverage` · `Coverage complete` · `Checks applied` ·
`Evidence lane` · `Parser confidence` · `Extraction confidence` ·
`Moderation state`

The last six are engineering vocabulary; the first six are non-answers.

**One legitimate exception:** these words may appear as _input options_ in
contribution forms, where "Unknown" means "I, the contributor, do not know" —
a genuine and useful answer from a person, not a display state.

## Approved public vocabulary

### Evidence and eligibility

| Public wording                                | Precise meaning                                                  | Never use for                      |
| --------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------- |
| **Explicitly open to Nigeria**                | The source's own wording names Nigeria or a region containing it | A bare "Remote"                    |
| **Explicitly open to Africa**                 | Source wording names Africa, EMEA, or an African country         | Inference from company location    |
| **Eligibility not resolved from the posting** | Source text exists but does not resolve to a country rule        | A posting that says nothing at all |
| **The posting does not state this**           | The source is silent on the field                                | A field we chose not to display    |
| **Not published by the source**               | The source has the value; its licence forbids republication      | Data we simply lack                |

The distinction that matters most: **"not resolved"** means the source spoke
and we refused to guess. **"does not state"** means the source was silent.
Collapsing them would hide the fact that a posting was ambiguous.

### Salary and pay

| Public wording                      | Precise meaning                                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Pay not advertised**              | The posting states no salary                                                                                               |
| **(est.)**                          | A naira take-home figure derived via published reference rates — always suffixed, never presented as the advertised number |
| **Below the publication threshold** | Evidence exists but fewer than 3 distinct contributors; the cell stays private                                             |
| **From N job postings**             | A market benchmark derived from postings, not from employee reports                                                        |
| **Original currency and period**    | Always shown alongside any conversion; a converted figure never replaces the source figure                                 |

### Freshness and lifecycle

| Public wording                                | Precise meaning                                                  |
| --------------------------------------------- | ---------------------------------------------------------------- |
| **Checked <date>**                            | When SalaryPadi last confirmed the posting at source             |
| **Posted <date>**                             | The source's own publication date                                |
| **This role may have closed**                 | Absence evidence gathered, not yet confirmed closed              |
| **Closed**                                    | Confirmed gone from the source, or past its stated deadline      |
| **This information may no longer be current** | Evidence older than its freshness window (interviews: 12 months) |

### Employer identity

| Public wording                        | Precise meaning                                                            |
| ------------------------------------- | -------------------------------------------------------------------------- |
| **Licensed <type>**                   | This exact legal entity appears on the regulator's register                |
| **Group parent of a licensed <type>** | A subsidiary is licensed; the parent is not                                |
| **Verified employer**                 | Claimed and confirmed by SalaryPadi                                        |
| **No regulator record found**         | We checked the register and found nothing — a statement, not an accusation |

Regulator claims name the exact licensed entity. A holding company is never
described as licensed because a subsidiary is.

### Personal state

| Public wording                                  | Precise meaning                                       |
| ----------------------------------------------- | ----------------------------------------------------- |
| **Saved**                                       | In the user's saved jobs                              |
| **Applied**                                     | The user marked it applied                            |
| **In progress / Interviewing / Offer / Closed** | Application tracker stages                            |
| **Sign in to save**                             | Signed-out prompt — never a wall on browsing or tools |

## Empty, partial and unavailable

Three distinct system states with three distinct presentations. They must not
be conflated, because they call for different user actions.

| State           | What it means                         | What the user sees                                    |
| --------------- | ------------------------------------- | ----------------------------------------------------- |
| **Empty**       | Query succeeded, nothing matched      | What to change: broaden filters, try a nearby role    |
| **Partial**     | Some sources answered, others did not | Results plus a plain note that the list is incomplete |
| **Unavailable** | The read failed                       | A plain statement and a retry — never a silent zero   |

The dangerous conflation is **unavailable rendered as empty**: "no jobs found"
when the truth is "we could not check" tells the user the market is dead when
in fact the product is broken.

## Adding a term

Any new user-facing state word is added here first, with its precise meaning
and what it must not be used for. If it is a non-answer, it belongs in the
prohibited list instead — and the prohibited-labels test is where that is
enforced.
