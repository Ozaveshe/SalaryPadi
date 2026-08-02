# Eligibility evidence

Whether a Nigerian candidate can actually apply is the single most valuable
fact SalaryPadi holds. It is stored as evidence, not as a badge: the badge is
derived, and every badge can be traced back to the text that produced it.

## The rule that defines the product

**"Remote" alone never becomes "open to Nigeria."**

Most remote roles are remote within a country or region the candidate is not
in. Treating a bare "Remote" as eligibility would produce a confident wrong
answer, and a confident wrong answer here costs someone an afternoon, an
application, and some of their belief that job hunting is worth the effort.
An honest "not resolved" is more useful than a hopeful yes.

## Evidence structure

`app.job_eligibility` holds the classification; `app.job_eligibility_countries`
holds the included and excluded country lists. Each evidence item carries:

- evidence type
- the source receipt it came from
- the source text or structured field
- country or region
- inclusion or exclusion
- evidence timestamp
- extraction method
- confidence
- review state
- expiry, where the claim is time-limited

## Categories

| Category                                  | Meaning                                                     |
| ----------------------------------------- | ----------------------------------------------------------- |
| Explicitly accepts Nigeria                | The wording names Nigeria                                   |
| Explicitly accepts Africa                 | Names Africa, EMEA, or an African region containing Nigeria |
| Explicit country list                     | An enumerated list; Nigeria is in it or it is not           |
| Global remote                             | Worldwide, with wording that genuinely means worldwide      |
| Remote with country restrictions          | Remote, but limited to named countries                      |
| Local-presence requirement                | Must already be in a place                                  |
| Work-authorisation requirement            | Must hold a specific right to work                          |
| Timezone restriction                      | Overlap requirement that may exclude in practice            |
| Payroll or employer-of-record restriction | Cannot be paid in the candidate's country                   |
| Citizenship restriction                   | Nationality requirement                                     |
| Eligibility unclear                       | Source spoke, wording does not resolve                      |
| Explicitly excludes Nigeria               | Named exclusion                                             |

## Two absences that are not the same

- **Unclear** — the source said something and it does not resolve.
- **Not stated** — the source said nothing about eligibility.

Collapsing them would hide that a posting was ambiguous. Neither is ever
rendered as the bare word "Unclear"; see
[`product-state-glossary.md`](./product-state-glossary.md) for the public
wording.

## Classifier lessons learned in production

Real failures that shaped the current rules:

- **"Home based - Worldwide/EMEA"** is a location format, not prose. The
  classifier reads home-based as remote and accepts the prefixed worldwide
  form.
- **Bare "anywhere" was a truth bug.** A mission statement containing
  "essential goods anytime, anywhere" published a US-only role as
  worldwide-eligible. Patterns now require "work from anywhere" or "anywhere
  in the world."
- **EMEA had to be reconciled across layers.** One database function excluded
  EMEA scope while every other layer accepted it, because Africa is a subset
  of EMEA. Public rows went from 84 to 214 when that was fixed — the bug was
  hiding real eligible roles, not inventing them.

## Publication is stricter than classification

Classification records what the source said. Publication decides what a
visitor sees, and it is deliberately stricter: a role must be remote and
explicitly say worldwide, Africa, EMEA, Nigeria, or name an African country —
or be physically located in an African market country.

Onsite-elsewhere, non-African-only, ambiguous and disqualifying
work-authorisation records are counted as policy filters, not silently
dropped, so the gap between what was ingested and what was published stays
measurable.

## Verified state

All 1,874 canonical jobs carry an eligibility evidence row. No published job
displays an eligibility badge without one.
