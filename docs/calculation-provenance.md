# Calculation provenance

A Pay & Offer workspace mixes numbers from four different worlds: what the
employer wrote down, what the user typed, what we computed, and what we
assumed in order to compute anything at all. Rendered as plain numbers they
become indistinguishable — and the most damaging failure in this product
follows immediately: **an assumed figure read back as an employer's promise.**

Implemented in
[`src/lib/workspace/value-provenance.ts`](../src/lib/workspace/value-provenance.ts).

## The six origins

| Origin               | Meaning                                     | Label shown              |
| -------------------- | ------------------------------------------- | ------------------------ |
| `employer_disclosed` | The employer stated it                      | Stated by the employer   |
| `user_entered`       | The user typed it                           | You entered this         |
| `calculated`         | Computed from stated or entered values only | Calculated by SalaryPadi |
| `assumption`         | We supplied it to make the maths possible   | SalaryPadi assumption    |
| `estimated`          | Derived, with uncertainty we cannot remove  | Estimate                 |
| `unknown`            | We do not know                              | Not known                |

Only `employer_disclosed` may be presented as something the employer
committed to. `isEmployerFact()` is the single check, so no surface can make
that judgement independently.

## The rule that stops laundering

**A calculation is only ever as trustworthy as its weakest input.**

Combining an employer-disclosed salary with an assumed PAYE band produces an
**estimate**, never a disclosed figure. Without this, an assumption launders
itself into a fact simply by passing through arithmetic — which is exactly
how "we assumed a tax band" becomes "the employer pays you this".

```
disclosed(600_000) + assumed(0.24) -> estimated
disclosed(600_000) + entered(50_000) -> calculated
disclosed(600_000) + unknown()       -> unknown
```

## A missing number is not zero

`computeValue()` returns `unknown` when any input is unknown, rather than
defaulting to zero. A missing bonus is not a bonus of nothing, and an offer
comparison that silently treats it as zero understates one side.

## Estimates are always marked

`displaySuffix()` appends "(est.)" to anything estimated or assumed, so a
screenshot of the workspace cannot misrepresent an estimate as a stated
figure. Stated values are never decorated this way.

`collectAssumptions()` returns every assumption behind a result for the
"what did you assume" disclosure. A result showing no assumptions is honest
only when there genuinely were none.

## No winner

`summariseComparison()` has **no winner field**, and a test asserts the
returned object's keys to keep it that way.

Which offer is better depends on things the workspace cannot see: how much
someone values health cover, whether they can absorb currency risk, what a
commute costs them in energy rather than naira. Naming a winner would present
a preference as a calculation. The summary instead states what each offer is
stronger at, lists the trade-offs it could not price, and ends by saying the
weighing is the reader's.
