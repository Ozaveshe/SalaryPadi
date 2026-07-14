import type { Metadata } from "next";

import { ContributionShell } from "@/components/contributions/contribution-shell";
import { DraftControls } from "@/components/contributions/draft-controls";
import { requireViewer } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Submit workplace benefits",
  robots: { index: false, follow: false },
};

const benefitFields = [
  ["pension", "Pension"],
  ["hmo", "HMO or health cover"],
  ["transport", "Transport support"],
  ["housing", "Housing support"],
  ["data_power", "Data or power support"],
  ["thirteenth_month", "Thirteenth-month pay"],
  ["bonus", "Bonus"],
] as const;

export default async function BenefitsContributionPage() {
  await requireViewer("/contribute/benefits");
  return (
    <ContributionShell
      title="Share workplace benefits"
      description="Report only benefits you personally received or were formally offered. Public benefit evidence appears only after an independent privacy cohort is reached."
    >
      <form
        id="benefits-contribution-form"
        className="contribution-form"
        action="/api/contributions/benefits"
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
              <label htmlFor="country">Country or office</label>
              <select
                className="select"
                id="country"
                name="country"
                defaultValue="NG"
              >
                <option value="NG">Nigeria</option>
                <option value="GH">Ghana</option>
                <option value="KE">Kenya</option>
                <option value="ZA">South Africa</option>
              </select>
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
          </div>
        </fieldset>
        <fieldset>
          <legend>Benefits received</legend>
          <p className="field-help">
            Choose unknown when a benefit was never explained to you.
          </p>
          <div className="form-grid">
            {benefitFields.map(([name, label]) => (
              <div className="field" key={name}>
                <label htmlFor={name}>{label}</label>
                <select
                  className="select"
                  id={name}
                  name={name}
                  defaultValue="unclear"
                >
                  <option value="yes">Received</option>
                  <option value="no">Not received</option>
                  <option value="unclear">Unknown</option>
                  <option value="not_applicable">Not applicable</option>
                </select>
              </div>
            ))}
          </div>
        </fieldset>
        <details className="contribution-details">
          <summary>Add working-pattern context</summary>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="overtime_expectation">Overtime</label>
              <select
                className="select"
                id="overtime_expectation"
                name="overtime_expectation"
                defaultValue="unclear"
              >
                <option value="rare">Rare</option>
                <option value="sometimes">Sometimes</option>
                <option value="frequent">Frequent</option>
                <option value="unclear">Unknown</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="weekend_work">Weekend work</label>
              <select
                className="select"
                id="weekend_work"
                name="weekend_work"
                defaultValue="unclear"
              >
                <option value="never">Never</option>
                <option value="sometimes">Sometimes</option>
                <option value="frequent">Frequent</option>
                <option value="unclear">Unknown</option>
              </select>
            </div>
            <div className="field form-full">
              <label htmlFor="context">Optional factual context</label>
              <textarea
                className="textarea"
                id="context"
                name="context"
                maxLength={700}
              />
            </div>
          </div>
        </details>
        <label className="checkbox">
          <input type="checkbox" name="accuracy_attestation" required />I am
          reporting my own experience and have removed private people and
          contact details.
        </label>
        <div className="notice">
          Payslips and documents are not accepted. Document verification remains
          disabled pending reviewed secure handling controls.
        </div>
        <button className="button w-fit" type="submit">
          Submit for moderation
        </button>
        <DraftControls formId="benefits-contribution-form" kind="benefits" />
      </form>
    </ContributionShell>
  );
}
