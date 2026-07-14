export interface CornerstoneDraft {
  slug: string;
  title: string;
  description: string;
  status: "draft";
  humanApprovalRequired: true;
  evidenceRequirements: string[];
  internalLinks: string[];
  bodyMarkdown: string;
}

export const CORNERSTONE_DRAFTS: readonly CornerstoneDraft[] = [
  {
    slug: "remote-job-eligibility-for-nigerians",
    title: "How to tell whether a remote job is open to Nigerians",
    description:
      "A practical evidence-first guide to applicant-location restrictions.",
    status: "draft",
    humanApprovalRequired: true,
    evidenceRequirements: [
      "SalaryPadi eligibility methodology",
      "Current source-policy matrix",
    ],
    internalLinks: ["/jobs/remote", "/methodology", "/tools/job-scam-checker"],
    bodyMarkdown: `A remote label describes where work may happen; it does not prove where an applicant may live. Start with the applicant-location statement on the original vacancy. Nigeria named directly is the clearest evidence. A worldwide statement can also include Nigeria unless the same posting lists an exclusion. Africa wording may include Nigeria, while EMEA or a time-zone preference alone remains ambiguous.

## Read the evidence in order

Check included countries, excluded countries, region wording, required time-zone overlap, work authorization and the employment arrangement. Keep each statement in its original context. “Remote” beside a United States employment requirement is not worldwide. A contractor opening may have a broader country list than an employee opening, but the arrangement itself is not eligibility evidence.

SalaryPadi should label a role eligible only when the source supplies positive evidence. Generic remote roles stay unclear. If the source conflicts with itself, the restrictive statement wins until a person verifies the employer’s intent. The Job Truth Card should show the exact evidence, its source, and when it was last checked.

## Before applying

- Open the original vacancy and confirm it is still active.
- Compare the country and authorization wording with your situation.
- Check whether the stated hours are workable from West Africa.
- Ask the employer a neutral eligibility question if the wording remains unclear.

[HUMAN REVIEW REQUIRED: confirm every methodology statement against the current eligibility policy before publication.]`,
  },
  {
    slug: "job-scam-warning-signs-nigeria",
    title: "How to check a job for scam warning signs",
    description:
      "A calm verification path for suspicious vacancies and recruiter messages.",
    status: "draft",
    humanApprovalRequired: true,
    evidenceRequirements: [
      "Official fraud guidance",
      "SalaryPadi trust and safety policy",
    ],
    internalLinks: ["/tools/job-scam-checker", "/trust-and-safety", "/jobs"],
    bodyMarkdown: `A warning sign is a reason to verify, not proof that a company or person is fraudulent. Begin with the original vacancy: find it from the employer’s official domain or the authorized source link, compare the role title and location, and confirm that the application destination matches the employer’s normal hiring path.

Treat payment demands, requests for banking credentials before a legitimate hiring need, pressure to move immediately to an unfamiliar channel, and identity documents sent to an unverified recipient as high-risk moments. A free email address or a rushed message can be suspicious, but neither should be used as a standalone accusation.

## A safer verification sequence

1. Navigate to the employer site independently instead of trusting a message link.
2. Compare the recruiter’s domain with the company’s cited official domains.
3. Confirm the job identifier, deadline and application destination.
4. Do not pay an application, interview, equipment-release or placement fee.
5. Share only the minimum information needed at the current hiring stage.

SalaryPadi’s scam checker should explain which answers raised concern and should never claim that a vacancy is safe. Reported jobs require moderation and evidence; reports must not automatically become public allegations.

[SOURCE REQUIRED: cite current official Nigerian and cross-border fraud guidance. HUMAN REVIEW REQUIRED before publication.]`,
  },
  {
    slug: "understand-take-home-pay-nigeria",
    title: "How to understand take-home pay in Nigeria",
    description:
      "A source-aware checklist for moving from stated pay to a cautious net-pay scenario.",
    status: "draft",
    humanApprovalRequired: true,
    evidenceRequirements: [
      "Current reviewed tax rules",
      "Calculator methodology and version",
    ],
    internalLinks: ["/tools/take-home-pay", "/salaries", "/methodology"],
    bodyMarkdown: `Take-home pay starts with the offer’s original facts: currency, amount, monthly or annual period, and whether the figure is gross or net. Do not annualize a monthly figure until you know whether it covers twelve payments, a thirteenth-month payment, or another schedule. Do not convert currencies until the exchange-rate source and date are visible.

Next separate employer-provided cash from assumptions. Base pay, fixed allowances, variable bonus, pension treatment and deductions belong on different lines. A calculator result is a scenario, not a payslip prediction. It should name the rule version, effective date, input period and any assumptions the user selected.

## Questions the offer should answer

- Is the stated amount gross or net?
- Which currency is paid, and who bears conversion fees?
- Are pension, HMO or allowances inside or outside base pay?
- Is bonus guaranteed, target-based or discretionary?
- Is the engagement employee or contractor?

Show a range when an input is uncertain. Preserve the original salary text beside every derived monthly or annual number so the calculation never replaces the source value.

[TAX AND SALARY REVIEW REQUIRED: verify the calculator version and every legal or tax statement against approved current sources before publication.]`,
  },
  {
    slug: "compare-two-job-offers",
    title: "How to compare two job offers without false precision",
    description:
      "A structured comparison of pay, risk, time and employment terms.",
    status: "draft",
    humanApprovalRequired: true,
    evidenceRequirements: [
      "Offer comparison methodology",
      "Reviewed tax sources for any net scenarios",
    ],
    internalLinks: [
      "/tools/offer-compare",
      "/tools/take-home-pay",
      "/companies",
    ],
    bodyMarkdown: `Start by copying each offer exactly as written. Record currency, pay period, gross or net status, fixed pay, variable pay and the proposed start date. Keep a source-value column and a derived-value column. This prevents a conversion or annualization assumption from quietly becoming “the offer.”

Then compare the working arrangement. Employee and contractor offers can differ in leave, pension, equipment, tax administration, notice, insurance and income reliability. Do not assign a cash value to a benefit unless the evidence supports it. A useful comparison can mark a field unknown instead of guessing.

## Compare four layers

1. Guaranteed compensation: base pay and fixed allowances.
2. Variable compensation: bonus, overtime and commissions with their conditions.
3. Work costs: commute, data, power, equipment and currency-conversion costs.
4. Decision factors: role scope, manager, learning, schedule, stability and deadline.

Use scenarios for uncertain exchange rates or bonuses. The “better” offer may change when a key assumption changes, so show the sensitivity instead of one authoritative score. Confirm every employer fact on an official document or cited first-party source.

[HUMAN REVIEW REQUIRED for tax, legal, salary and employer-specific claims before publication.]`,
  },
  {
    slug: "salary-negotiation-with-evidence",
    title: "How to negotiate salary using evidence",
    description:
      "A preparation framework that separates market evidence from personal priorities.",
    status: "draft",
    humanApprovalRequired: true,
    evidenceRequirements: [
      "Privacy-thresholded salary methodology",
      "Current role and location evidence",
    ],
    internalLinks: ["/salaries", "/tools/offer-compare", "/companies"],
    bodyMarkdown: `Good negotiation begins with the role in front of you, not a universal number. Confirm scope, seniority, location, arrangement, currency and pay period. Compare only salary evidence with compatible fields and show sample size, date range and confidence. A small or mixed cohort should not produce a precise benchmark.

Prepare three parts of the conversation: the evidence you can cite, the value and responsibilities you can explain, and the terms that matter if base pay cannot move. Keep confidential information out of the discussion. First-party salary contributions may support an aggregate only after the privacy threshold; an individual submission is never a quote to repeat.

## A neutral request

State your understanding of the role, identify the compensation element you want reviewed, explain the evidence or responsibility behind the request, and invite the employer to clarify the available range. Avoid inventing competing offers or making unsupported market claims.

Consider currency policy, review timing, bonus conditions, leave, remote-work costs and professional development separately. Record the final terms in writing and compare the revised offer with the original source values.

[SALARY AND EMPLOYMENT REVIEW REQUIRED. Add only cohort-backed figures with sample size, geography, date range and confidence.]`,
  },
  {
    slug: "graduate-trainee-internship-and-nysc-jobs",
    title: "Graduate trainee, internship and NYSC jobs: what the labels mean",
    description:
      "An evidence checklist for early-career job requirements in Nigeria.",
    status: "draft",
    humanApprovalRequired: true,
    evidenceRequirements: [
      "Current employer vacancy evidence",
      "Reviewed NYSC official guidance where needed",
    ],
    internalLinks: ["/jobs/graduate", "/jobs/nigeria", "/methodology"],
    bodyMarkdown: `Graduate trainee, internship, entry-level and NYSC roles are not interchangeable. Use the employer’s stated label and preserve its requirements. A graduate trainee programme may name a graduation window, degree class or service status. An internship may be student-only, graduate-level, paid, unpaid or tied to a fixed period. NYSC wording can describe eligibility, a preferred status or a service placement.

Read the vacancy for qualification, graduation date, experience ceiling, location, work schedule, compensation and deadline. If HND is accepted, show that evidence directly. If the source says BSc required, do not broaden the role. Silence about qualification type is unknown, not proof of exclusion.

## Build an application check

- Confirm the programme type and start date.
- Check whether NYSC is required, optional or not mentioned.
- Match HND, BSc and professional-certification wording exactly.
- Verify location, relocation and any bond or service commitment.
- Confirm salary or stipend period and whether the amount is gross or net.

The landing page must update from active canonical jobs and disappear from search when its volume or diversity gate fails.

[HUMAN REVIEW REQUIRED for NYSC, education and employment claims before publication.]`,
  },
  {
    slug: "hnd-versus-bsc-job-requirements",
    title: "HND versus BSc requirements in job listings",
    description:
      "How to read education requirements without inferring what an employer did not say.",
    status: "draft",
    humanApprovalRequired: true,
    evidenceRequirements: [
      "Current first-party vacancy wording",
      "Reviewed qualification guidance if referenced",
    ],
    internalLinks: ["/jobs/graduate", "/jobs", "/methodology"],
    bodyMarkdown: `Treat the qualification line as source evidence, not a general judgment about candidates. “HND accepted,” “BSc required,” “degree or equivalent experience,” and no education statement are four different states. SalaryPadi should store the exact state and must not translate one into another.

Read nearby requirements for role-specific context: field of study, professional certification, years of experience and portfolio evidence. An employer may use “degree” loosely or may have a strict screening rule. If the meaning is material and ambiguous, ask the employer rather than presenting an inference as fact.

## Applying with a different qualification

Separate mandatory language from preferred language. Show relevant experience and evidence, but do not claim equivalence that the employer or an official framework has not established. A job directory filter should return only roles with positive structured evidence for HND acceptance; a missing qualification field should remain unknown.

For aggregate reporting, count source statements, not assumptions about employer policy. Record the sample window and avoid implying that a small set of vacancies describes the whole labour market.

[EDUCATION AND EMPLOYMENT REVIEW REQUIRED. Cite any framework or equivalence claim from an approved official source.]`,
  },
  {
    slug: "contractor-versus-employee-offers",
    title: "Contractor versus employee offers: a decision checklist",
    description:
      "A cautious comparison of arrangement evidence, pay and responsibilities.",
    status: "draft",
    humanApprovalRequired: true,
    evidenceRequirements: [
      "Reviewed employment and tax sources",
      "Offer comparison methodology",
    ],
    internalLinks: ["/tools/offer-compare", "/tools/take-home-pay", "/jobs"],
    bodyMarkdown: `The arrangement label changes how an offer should be compared, but the label alone does not settle legal status. Start with the written terms: who controls the schedule, how work is delivered, how long the engagement lasts, what may terminate it, and which party handles equipment, insurance, pension and taxes.

Compare pay on the same period while preserving the original amount and currency. Add only evidenced employer-paid benefits. For a contractor scenario, record unpaid time, administration, equipment, data, power and currency-conversion exposure as separate assumptions. Do not turn those assumptions into a universal contractor “discount.”

## Questions to resolve

- What entity signs and pays the agreement?
- Is the amount gross or net, and which deductions apply?
- Are leave, public holidays and sick time paid?
- Is work exclusive, and what notice applies?
- Who owns equipment and work product?
- What happens when exchange rates or transfer fees change?

Use professional advice for a material legal or tax decision. SalaryPadi can organize evidence and scenarios; it should not classify a worker’s legal status from a vacancy alone.

[LEGAL, TAX AND EMPLOYMENT REVIEW REQUIRED before publication.]`,
  },
  {
    slug: "visa-sponsorship-evidence-for-nigerians",
    title: "How to read visa-sponsorship evidence in a job listing",
    description:
      "A country, location and authorization checklist for cross-border roles.",
    status: "draft",
    humanApprovalRequired: true,
    evidenceRequirements: [
      "Current official immigration sources",
      "Employer vacancy evidence",
    ],
    internalLinks: ["/jobs/visa-sponsorship", "/jobs/remote", "/methodology"],
    bodyMarkdown: `Visa sponsorship, relocation support and remote eligibility answer different questions. A role can be remote without sponsorship, sponsor only candidates moving to one country, or offer relocation without covering immigration. Store each field separately and preserve the source wording.

Check the physical job location, applicant countries, existing work-authorization requirement, visa type if named, sponsorship statement, relocation support and deadline. “Sponsorship may be available” is weaker than a confirmed programme. “No sponsorship” is an explicit exclusion. If the listing says nothing, the state is unclear.

## Before investing in an application

1. Confirm the vacancy on the employer’s official careers site.
2. Check whether Nigerian applicants are included.
3. Read the current official immigration route for the destination.
4. Ask which costs and family arrangements, if any, the employer supports.
5. Avoid any third party asking for payment to guarantee a visa or job.

The visa-sponsorship landing page should include only positive source evidence and should automatically become noindex when it fails the job-volume, company-diversity or demand gate.

[IMMIGRATION AND LEGAL REVIEW REQUIRED. Add destination-specific facts only from current official sources.]`,
  },
  {
    slug: "interview-preparation-with-company-evidence",
    title: "How to prepare for an interview using company evidence",
    description:
      "A first-party, privacy-safe way to prepare without copying third-party reports.",
    status: "draft",
    humanApprovalRequired: true,
    evidenceRequirements: [
      "Official company facts",
      "Approved first-party interview aggregates",
    ],
    internalLinks: ["/companies", "/jobs", "/contribute/interview"],
    bodyMarkdown: `Build interview preparation from the role, the employer’s cited official facts and approved first-party SalaryPadi contributions. Do not copy, summarize or rewrite third-party interview reports. Community evidence should appear only after moderation and the configured privacy threshold, with sample size, date range, geography and verification mix.

Start with the vacancy. List the responsibilities, required evidence and unanswered questions. Then review the company page for legal entity, official domains, products, offices and current jobs. Keep employer-provided statements separate from community aggregates.

## Prepare a compact evidence sheet

- Three role responsibilities and one example for each.
- Questions about scope, manager, success measures and working arrangement.
- Salary, location, authorization and schedule points that need clarification.
- Official company facts with their source and freshness date.
- Interview themes only when the first-party cohort is publishable.

An empty interview section is an honest state, not evidence of a good or bad process. After the interview, a contributor may save a private draft and submit a structured experience without names, contact details, confidential questions or identifying evidence.

[HUMAN REVIEW REQUIRED for employer and workplace claims before publication.]`,
  },
  {
    slug: "how-salarypadi-builds-company-intelligence",
    title: "How SalaryPadi builds company intelligence",
    description:
      "The separation between cited official facts and privacy-thresholded community evidence.",
    status: "draft",
    humanApprovalRequired: true,
    evidenceRequirements: [
      "Company intelligence data contract",
      "Moderation and privacy policies",
    ],
    internalLinks: ["/companies", "/methodology", "/trust-and-safety"],
    bodyMarkdown: `A SalaryPadi company profile has two evidence lanes. Official facts come from the company’s own site, public filings or registries, and verified employer submissions. Each fact records its source, retrieval date and freshness. Employer-provided facts are labelled and do not become community opinion.

Community evidence comes only from first-party contributions submitted to SalaryPadi. Private identity and abuse signals stay separate from the anonymous public contribution. Reviews, salaries, benefits, pay reliability and interviews require moderation. No third-party review text, rating, salary or community post may enter the database, seed data, search index or an AI prompt.

## Public evidence rules

Overall ratings wait for the minimum number of approved independent reviews. Salary aggregates wait for the configured privacy cohort. Every aggregate shows sample size, country or office, date range, verification mix and confidence. Employers may claim a company and respond, but they cannot identify a reviewer or alter community ratings.

An empty state means evidence is missing. It is not a trust badge. Corrections, reports, appeals, takedowns and deletions preserve an audit history without exposing removed personal data.

[PRIVACY, MODERATION AND EMPLOYER-FACT REVIEW REQUIRED before publication.]`,
  },
  {
    slug: "how-salarypadi-measures-job-freshness",
    title: "How SalaryPadi measures job freshness and closure",
    description:
      "A reproducible explanation of source checks, deadlines and conservative absence handling.",
    status: "draft",
    humanApprovalRequired: true,
    evidenceRequirements: [
      "Job lifecycle implementation",
      "Source run ledger and policy registry",
    ],
    internalLinks: ["/methodology", "/jobs", "/trust-and-safety"],
    bodyMarkdown: `A page rendering successfully does not prove that its job is fresh. SalaryPadi records when the source published the role, when a source run observed it, when eligibility was verified, and when the application link was checked. The public page should expose the relevant dates without collapsing them into one “updated” label.

Deadlines close a job promptly. A confirmed source closure closes it immediately. One absence after a successful complete run moves the occurrence into checking; a second successful absence at least thirty minutes later can close it. Failed, partial, timed-out, forbidden or rate-limited runs must never close jobs. Manual submissions without a deadline need reconfirmation or expire under the manual lifecycle rule.

## What freshness does not mean

Freshness is not employer verification, applicant eligibility or proof that an application will receive a response. Source permission is also separate: a fresh supplemental record may be visible on a noindex directory while remaining ineligible for a sitemap, JobPosting markup or Google notification.

Published methodology must match the tested lifecycle code and the production run ledger. When those disagree, the page should be corrected or archived rather than defended with a stale claim.

[METHODOLOGY AND SOURCE-POLICY REVIEW REQUIRED before publication.]`,
  },
] as const;
