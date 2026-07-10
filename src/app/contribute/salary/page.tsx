import type { Metadata } from "next";

import { ContributionShell } from "@/components/contributions/contribution-shell";
import { requireViewer } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Submit salary",
  robots: { index: false, follow: false },
};

const moneyBenefits = [
  ["bonus", "Bonus"],
  ["commission", "Commission"],
  ["pension", "Employee pension amount"],
  ["health_cover", "Health cover value"],
  ["transport", "Transport allowance"],
  ["housing", "Housing allowance"],
  ["lunch", "Lunch allowance"],
  ["data_airtime", "Data or airtime"],
  ["power_allowance", "Power allowance"],
  ["thirteenth_month", "Thirteenth-month pay"],
] as const;

export default async function SalaryContributionPage() {
  await requireViewer("/contribute/salary");
  return (
    <ContributionShell
      title="Share salary evidence"
      description="Preserve the original amount, currency and pay period. SalaryPadi calculates equivalents later without replacing what you reported."
    >
      <form
        className="contribution-form"
        action="/api/contributions/salary"
        method="post"
      >
        <fieldset>
          <legend>Role and work</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="role">Role title</label>
              <input
                className="input"
                id="role"
                name="role"
                maxLength={160}
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
                placeholder="e.g. Product, Finance, Engineering"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="company">Company</label>
              <input
                className="input"
                id="company"
                name="company"
                maxLength={180}
              />
              <p className="field-help">Leave blank to prefer not to say.</p>
            </div>
            <div className="field">
              <label htmlFor="country">Country</label>
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
              <label htmlFor="city">City</label>
              <input className="input" id="city" name="city" maxLength={120} />
            </div>
            <div className="field">
              <label htmlFor="work_mode">Work mode</label>
              <select
                className="select"
                id="work_mode"
                name="work_mode"
                required
              >
                <option value="onsite">Onsite</option>
                <option value="hybrid">Hybrid</option>
                <option value="remote">Remote</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="employment_type">Employment type</label>
              <select
                className="select"
                id="employment_type"
                name="employment_type"
                required
              >
                <option value="full_time">Full time</option>
                <option value="part_time">Part time</option>
                <option value="contract">Contract</option>
                <option value="internship">Internship</option>
                <option value="freelance">Freelance</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="arrangement">Arrangement</label>
              <select
                className="select"
                id="arrangement"
                name="arrangement"
                required
              >
                <option value="employee">Employee</option>
                <option value="contractor">Contractor</option>
                <option value="freelance">Freelance</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="seniority">Seniority</label>
              <select
                className="select"
                id="seniority"
                name="seniority"
                required
              >
                <option value="entry">Entry / graduate</option>
                <option value="mid">Mid-level</option>
                <option value="senior">Senior</option>
                <option value="lead">Lead / principal</option>
                <option value="executive">Executive</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="years_experience">Years of experience</label>
              <input
                className="input"
                id="years_experience"
                name="years_experience"
                type="number"
                min="0"
                max="60"
                step="0.5"
                required
              />
            </div>
          </div>
        </fieldset>
        <fieldset>
          <legend>Original compensation</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="base_salary">Base salary</label>
              <input
                className="input"
                id="base_salary"
                name="base_salary"
                type="number"
                min="1"
                step="0.01"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="currency">Currency</label>
              <select
                className="select"
                id="currency"
                name="currency"
                defaultValue="NGN"
                required
              >
                {["NGN", "USD", "EUR", "GBP", "GHS", "KES", "ZAR"].map(
                  (currency) => (
                    <option value={currency} key={currency}>
                      {currency}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pay_period">Pay period</label>
              <select
                className="select"
                id="pay_period"
                name="pay_period"
                defaultValue="monthly"
                required
              >
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="gross_net">Amount is</label>
              <select
                className="select"
                id="gross_net"
                name="gross_net"
                required
              >
                <option value="gross">Gross</option>
                <option value="net">Net</option>
              </select>
            </div>
          </div>
        </fieldset>
        <fieldset>
          <legend>Additional pay and benefits</legend>
          <p className="field-help">
            Use amounts in the same currency and pay period where known. Leave
            unknown fields blank.
          </p>
          <div className="form-grid">
            {moneyBenefits.map(([name, label]) => (
              <div className="field" key={name}>
                <label htmlFor={name}>{label}</label>
                <input
                  className="input"
                  id={name}
                  name={name}
                  type="number"
                  min="0"
                  step="0.01"
                />
              </div>
            ))}
            <div className="field">
              <label htmlFor="equity">Equity</label>
              <input
                className="input"
                id="equity"
                name="equity"
                maxLength={300}
              />
            </div>
            <div className="field">
              <label htmlFor="other_benefits">Other benefits</label>
              <textarea
                className="textarea"
                id="other_benefits"
                name="other_benefits"
                maxLength={500}
              />
            </div>
          </div>
        </fieldset>
        <fieldset>
          <legend>Payment reality</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="payment_reliability">
                Salary payment reliability
              </label>
              <select
                className="select"
                id="payment_reliability"
                name="payment_reliability"
                required
              >
                <option value="always_on_time">Always on time</option>
                <option value="usually_on_time">Usually on time</option>
                <option value="sometimes_late">Sometimes late</option>
                <option value="often_late">Often late</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="foreign_currency_policy">
                Foreign-currency conversion policy
              </label>
              <textarea
                className="textarea"
                id="foreign_currency_policy"
                name="foreign_currency_policy"
                maxLength={500}
              />
            </div>
          </div>
        </fieldset>
        <label className="checkbox">
          <input type="checkbox" name="accuracy_attestation" required />I am
          sharing my own experience, and the information is accurate to the best
          of my knowledge.
        </label>
        <button className="button w-fit" type="submit">
          Submit for moderation
        </button>
      </form>
    </ContributionShell>
  );
}
