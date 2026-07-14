import type { Metadata } from "next";

import { ContributionShell } from "@/components/contributions/contribution-shell";
import { DraftControls } from "@/components/contributions/draft-controls";
import { requireViewer } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Submit pay reliability",
  robots: { index: false, follow: false },
};

export default async function PayReliabilityContributionPage() {
  await requireViewer("/contribute/pay-reliability");
  return (
    <ContributionShell
      title="Share pay reliability evidence"
      description="Use coarse timing bands from your own experience. SalaryPadi never publishes a single report or a precise claim from a small cohort."
    >
      <form
        id="pay-reliability-contribution-form"
        className="contribution-form"
        action="/api/contributions/pay_reliability"
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
            <div className="field">
              <label htmlFor="observation_window">Time observed</label>
              <select
                className="select"
                id="observation_window"
                name="observation_window"
              >
                <option value="under_3_months">Under 3 months</option>
                <option value="3_to_6_months">3 to 6 months</option>
                <option value="6_to_12_months">6 to 12 months</option>
                <option value="over_12_months">Over 12 months</option>
              </select>
            </div>
          </div>
        </fieldset>
        <fieldset>
          <legend>Payment pattern</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="on_time_frequency">
                How often was pay on time?
              </label>
              <select
                className="select"
                id="on_time_frequency"
                name="on_time_frequency"
              >
                <option value="always_on_time">Always on time</option>
                <option value="usually_on_time">Usually on time</option>
                <option value="sometimes_late">Sometimes late</option>
                <option value="often_late">Often late</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="longest_delay">Longest delay</label>
              <select
                className="select"
                id="longest_delay"
                name="longest_delay"
              >
                <option value="none">No delay</option>
                <option value="under_1_week">Under one week</option>
                <option value="1_to_4_weeks">One to four weeks</option>
                <option value="over_1_month">Over one month</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="arrears_resolved">Were arrears resolved?</label>
              <select
                className="select"
                id="arrears_resolved"
                name="arrears_resolved"
              >
                <option value="not_applicable">Not applicable</option>
                <option value="yes">Yes</option>
                <option value="partly">Partly</option>
                <option value="no">No</option>
                <option value="unclear">Unknown</option>
              </select>
            </div>
          </div>
        </fieldset>
        <details className="contribution-details">
          <summary>Add currency-policy context</summary>
          <div className="stack">
            <div className="field">
              <label htmlFor="fx_policy">
                FX policy, if pay was currency-linked
              </label>
              <textarea
                className="textarea"
                id="fx_policy"
                name="fx_policy"
                maxLength={500}
              />
            </div>
            <div className="field">
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
        <button className="button w-fit" type="submit">
          Submit for moderation
        </button>
        <DraftControls
          formId="pay-reliability-contribution-form"
          kind="pay_reliability"
        />
      </form>
    </ContributionShell>
  );
}
