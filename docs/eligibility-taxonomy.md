# Eligibility taxonomy

One vocabulary, used by search filters, job cards, collections and ranking.
A user who learns what a badge means on a card must find it means the same
thing in a filter.

## The six states

| State                     | Definition                                                                                          | Badge                                |
| ------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `nigeria_explicit`        | The source explicitly names Nigeria                                                                 | Nigeria explicitly accepted          |
| `africa_explicit`         | The source names Africa or a qualifying set of African countries                                    | Africa explicitly accepted           |
| `global_remote_reviewed`  | Broad remote support, no detected rule excluding Nigeria; the employment arrangement is still shown | Global remote, restrictions reviewed |
| `local_presence_required` | The candidate must already live or work in the stated location                                      | Local presence required              |
| `unclear`                 | The source does not provide enough evidence                                                         | Eligibility unclear                  |
| `not_eligible`            | The source explicitly excludes Nigeria or restricts to another jurisdiction                         | Not eligible for Nigeria             |

## The rule that defines the product

**Vague remote language never becomes eligibility.** A listing that says only
"Remote" is `unclear`, not `global_remote_reviewed`. The distinction is
whether a human-reviewable rule was found, not whether the word appeared.

This has been wrong in production before: a mission statement containing
"essential goods anytime, anywhere" once published a US-only role as
worldwide-eligible. The patterns now require "work from anywhere" or
"anywhere in the world".

## Unclear jobs are shown, never promoted

An unclear job appears in general results, clearly badged. It is **never**
placed inside an explicitly-eligible result group, because appearing there is
itself a claim that the reader can apply.

This is enforced in two places that cannot drift apart: the quality gate
returns a separate `eligibilityCollection`, and `mayEnterNigeriaCollection()`
is a distinct function so a caller cannot mistake "publishable" for
"promotable".

## Evidence, not assertion

Every badge traces to stored evidence carrying the source's own words, so the
interface can show why:

- "The listing explicitly states that applications are accepted from Nigeria."
- "The listing names Africa as an eligible region."
- "The listing requires residence in the United Kingdom."
- "The listing says remote but does not define eligible countries."

The link to the original source is always preserved, so a user who doubts the
badge can check it themselves.
