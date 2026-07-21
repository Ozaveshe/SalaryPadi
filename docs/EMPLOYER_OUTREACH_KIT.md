# Employer outreach kit — ATS listing permission

SalaryPadi only ingests employer ATS boards with written permission or a
commercial contract (see `docs/JOB_INGESTION_ARCHITECTURE.md`). That boundary
is a feature: every listing on SalaryPadi is authorized, attributed and
truthful, which is exactly the trust African job-seekers and employers are
missing elsewhere. This kit turns that boundary into a growth channel — each
"yes" reply becomes a permanent, first-party job supply line plus a claimed
employer profile.

## Why employers say yes

- Free, permanent listing of every open role in front of Nigerian and
  pan-African candidates who can actually apply.
- Zero integration work: we read the public ATS board they already publish
  (Greenhouse/Lever), refresh it automatically, and always send applicants to
  their own application flow.
- A verified company profile with right-of-reply on reviews — employers get a
  voice on the platform, not just a rating.
- Permission-based listing, in writing, revocable at any time.

## Verified live public boards (checked 2026-07-21)

These companies already publish a public ATS board today, so onboarding after
permission is immediate:

| Company | Country focus | ATS | Board token | Open roles at check |
| --- | --- | --- | --- | --- |
| Moniepoint | Nigeria | Greenhouse | `moniepoint` | 110 |
| Carbon | Nigeria | Greenhouse | `carbon` | 12 |
| Jumia | Pan-African | Greenhouse | `jumia` | 9 |
| Tala | Kenya (+global) | Lever | `tala` | 10 |

Endpoint forms used for verification:
`https://boards-api.greenhouse.io/v1/boards/<token>/jobs` and
`https://api.lever.co/v0/postings/<token>?mode=json`.

Companies checked without a discoverable Greenhouse/Lever board (they likely
use Workday/SAP/other or a custom careers site — outreach still applies, via
the employer-submission flow instead): Paystack, Flutterwave, Andela, Kuda,
M-KOPA, Moove, Yassir, Paymob, Reliance Health, Helium Health, Interswitch,
Sun King, Termii, PiggyVest, PalmPay, OPay, Kobo360, SeamlessHR, Risevest,
FairMoney, LemFi, Vendease, ThriveAgric, Releaf.

## Email template

Subject: Free authorized listing of your open roles on SalaryPadi

> Hello [Name / Talent team],
>
> I'm building SalaryPadi (salarypadi.com) — a jobs and pay-transparency
> platform for African professionals. Every job we list is authorized by the
> employer, attributed, and links candidates straight to your own application
> page. No scraping, no reposting your descriptions elsewhere.
>
> You already publish your open roles on [Greenhouse/Lever/your careers
> site]. With your written permission, we would:
>
> - list your open roles automatically and keep them fresh,
> - always send applicants to your own [ATS] application flow,
> - give [Company] a verified employer profile with right-of-reply.
>
> This is free. Permission is revocable at any time in writing.
>
> If you're happy for us to proceed, a one-line reply — "SalaryPadi may list
> the roles we publish on our [ATS] board" — from a company email address is
> all we need. I can also send a short permission letter if you prefer.
>
> Thank you,
> [Your name] — Founder, SalaryPadi
> support@salarypadi.com

## What happens after a "yes"

1. Save the reply (email or letter) — it becomes the
   `authorization_evidence_ref` for the source registration.
2. Register the board in the ATS pipeline with
   `authorization_basis = 'written_permission'`, the evidence reference, the
   reviewer and review dates.
3. The `ats-source-sync` worker (already deployed, runs every 15 minutes)
   ingests the board; jobs appear on /jobs with employer attribution.
4. Invite the employer to claim their company profile (/companies/<slug>/claim)
   so their right-of-reply is active before reviews arrive.

## Suggested first wave (highest volume, Nigeria-first)

1. Moniepoint — 110 live roles, Nigerian fintech, immediate 2-3x site supply.
2. Carbon — 12 roles, Nigerian digital bank.
3. Jumia — 9 roles, pan-African brand recognition.
4. Tala — 10 roles, Kenya expansion story.
5. The Nigerian corporates already in the SalaryPadi catalog (Zenith Bank,
   GTCO, MTN Nigeria, Dangote Cement, BUA, Transcorp Power, Geregu Power,
   Aradel) — via their HR/careers contact, offering the employer-submission
   flow where no public ATS board exists.
