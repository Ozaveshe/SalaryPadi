import type { Metadata } from "next";

import { ContributionShell } from "@/components/contributions/contribution-shell";
import { requireViewer } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Submit workplace review",
  robots: { index: false, follow: false },
};

const ratings = [
  ["compensation_rating", "Compensation"],
  ["pay_reliability_rating", "Pay reliability"],
  ["management_rating", "Management"],
  ["work_life_rating", "Work-life balance"],
  ["growth_rating", "Career growth"],
  ["job_security_rating", "Job security"],
  ["leave_quality", "Leave"],
  ["inclusion_rating", "Inclusion"],
  ["safety_rating", "Workplace safety"],
] as const;

export default async function ReviewContributionPage() {
  await requireViewer("/contribute/review");
  return (
    <ContributionShell
      title="Share a workplace review"
      description="Focus on your own experience and workplace conditions. Do not name ordinary managers, coworkers or other private people."
    >
      <form
        className="contribution-form"
        action="/api/contributions/review"
        method="post"
      >
        <fieldset>
          <legend>Employment context</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="company">Company</label>
              <input
                className="input"
                id="company"
                name="company"
                maxLength={180}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="role_family">Role family</label>
              <input
                className="input"
                id="role_family"
                name="role_family"
                maxLength={120}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="employment_status">Status</label>
              <select
                className="select"
                id="employment_status"
                name="employment_status"
              >
                <option value="current">Current employee</option>
                <option value="former">Former employee</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="employment_period">Approximate period</label>
              <select
                className="select"
                id="employment_period"
                name="employment_period"
              >
                <option value="under_6_months">Under 6 months</option>
                <option value="6_to_12_months">6–12 months</option>
                <option value="1_to_2_years">1–2 years</option>
                <option value="2_to_5_years">2–5 years</option>
                <option value="over_5_years">Over 5 years</option>
              </select>
            </div>
          </div>
        </fieldset>
        <fieldset>
          <legend>Ratings</legend>
          <p className="field-help">
            1 is poor; 5 is excellent. Ratings are withheld until the review
            threshold is met.
          </p>
          <div className="form-grid">
            {ratings.map(([name, label]) => (
              <div className="field" key={name}>
                <label htmlFor={name}>{label}</label>
                <select
                  className="select"
                  id={name}
                  name={name}
                  defaultValue="3"
                >
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <option value={rating} key={rating}>
                      {rating}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Benefits and working reality</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="pension_compliance">
                Pension/statutory compliance
              </label>
              <select
                className="select"
                id="pension_compliance"
                name="pension_compliance"
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
                <option value="unclear">Unclear</option>
                <option value="not_applicable">Not applicable</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="health_cover">HMO or health cover</label>
              <select className="select" id="health_cover" name="health_cover">
                <option value="yes">Yes</option>
                <option value="no">No</option>
                <option value="unclear">Unclear</option>
                <option value="not_applicable">Not applicable</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="overtime_expectation">Overtime</label>
              <select
                className="select"
                id="overtime_expectation"
                name="overtime_expectation"
              >
                <option value="rare">Rare</option>
                <option value="sometimes">Sometimes</option>
                <option value="frequent">Frequent</option>
                <option value="unclear">Unclear</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="weekend_work">Weekend work</label>
              <select className="select" id="weekend_work" name="weekend_work">
                <option value="never">Never</option>
                <option value="sometimes">Sometimes</option>
                <option value="frequent">Frequent</option>
                <option value="unclear">Unclear</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="remote_reality">
                Remote/hybrid and commute reality
              </label>
              <textarea
                className="textarea"
                id="remote_reality"
                name="remote_reality"
                maxLength={500}
              />
            </div>
            <div className="field">
              <label htmlFor="support_provided">
                Internet, airtime or power support
              </label>
              <textarea
                className="textarea"
                id="support_provided"
                name="support_provided"
                maxLength={500}
              />
            </div>
          </div>
        </fieldset>
        <fieldset>
          <legend>Your review</legend>
          <div className="stack">
            <div className="field">
              <label htmlFor="pros">What worked well?</label>
              <textarea
                className="textarea"
                id="pros"
                name="pros"
                maxLength={2000}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="cons">What could be better?</label>
              <textarea
                className="textarea"
                id="cons"
                name="cons"
                maxLength={2000}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="advice">Advice to management (optional)</label>
              <textarea
                className="textarea"
                id="advice"
                name="advice"
                maxLength={1500}
              />
            </div>
          </div>
        </fieldset>
        <label className="checkbox">
          <input type="checkbox" name="anonymity_attestation" required />I have
          removed names, email addresses, phone numbers and details that
          identify private individuals.
        </label>
        <button className="button w-fit" type="submit">
          Submit for moderation
        </button>
      </form>
    </ContributionShell>
  );
}
