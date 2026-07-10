import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeading } from "@/components/page-heading";
import { requireViewer } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Post a job",
  robots: { index: false, follow: false },
};

export default async function PostAJobPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  await requireViewer("/post-a-job");
  const { submitted } = await searchParams;
  return (
    <div className="reading-shell stack-lg">
      <Breadcrumbs
        items={[{ label: "Home", href: "/" }, { label: "Post a job" }]}
      />
      <PageHeading
        eyebrow="Moderated employer submission"
        title="Publish a vacancy with the eligibility made clear"
        description="Every submission starts pending. A fee can never bypass moderation, and sponsorship never changes ratings or trust decisions."
      />
      {submitted === "true" ? (
        <div className="notice" role="status">
          <strong>Submitted for moderation.</strong> The vacancy is not public
          yet. A moderator must review its source, eligibility and safety
          evidence first.
        </div>
      ) : null}
      {submitted === "error" ? (
        <div className="notice notice-danger" role="alert">
          <strong>The submission was not saved.</strong> Check your connection
          and backend setup, then try again. No vacancy was published.
        </div>
      ) : null}
      <div className="notice">
        <strong>Use authorised, factual information.</strong> Corporate email
        matching is a verification signal, not proof of identity. SalaryPadi may
        request additional evidence.
      </div>
      <form
        className="contribution-form"
        action="/api/employer-submissions"
        method="post"
      >
        <fieldset>
          <legend>Company and contact</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="company_name">Company name</label>
              <input
                className="input"
                id="company_name"
                name="company_name"
                maxLength={180}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="corporate_email">Corporate email</label>
              <input
                className="input"
                id="corporate_email"
                name="corporate_email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="company_website">Company website</label>
              <input
                className="input"
                id="company_website"
                name="company_website"
                type="url"
                placeholder="https://"
                required
              />
            </div>
          </div>
        </fieldset>
        <fieldset>
          <legend>Vacancy</legend>
          <div className="stack">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="title">Job title</label>
                <input
                  className="input"
                  id="title"
                  name="title"
                  maxLength={200}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="location">Location</label>
                <input
                  className="input"
                  id="location"
                  name="location"
                  maxLength={200}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="work_mode">Work mode</label>
                <select className="select" id="work_mode" name="work_mode">
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
                >
                  <option value="full_time">Full time</option>
                  <option value="part_time">Part time</option>
                  <option value="contract">Contract</option>
                  <option value="temporary">Temporary</option>
                  <option value="internship">Internship</option>
                  <option value="freelance">Freelance</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="arrangement">Arrangement</label>
                <select className="select" id="arrangement" name="arrangement">
                  <option value="employee">Employee</option>
                  <option value="contractor">Contractor</option>
                  <option value="freelance">Freelance</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="experience_level">Experience level</label>
                <select
                  className="select"
                  id="experience_level"
                  name="experience_level"
                >
                  <option value="entry">Entry</option>
                  <option value="mid">Mid-level</option>
                  <option value="senior">Senior</option>
                  <option value="lead">Lead</option>
                  <option value="executive">Executive</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="description">Description</label>
              <textarea
                className="textarea"
                id="description"
                name="description"
                minLength={100}
                maxLength={20000}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="requirements">Requirements</label>
              <textarea
                className="textarea"
                id="requirements"
                name="requirements"
                minLength={20}
                maxLength={10000}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="benefits">Benefits</label>
              <textarea
                className="textarea"
                id="benefits"
                name="benefits"
                maxLength={5000}
              />
            </div>
          </div>
        </fieldset>
        <fieldset>
          <legend>Eligibility evidence</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="eligibility_scope">Scope</label>
              <select
                className="select"
                id="eligibility_scope"
                name="eligibility_scope"
              >
                <option value="nigeria">Nigeria</option>
                <option value="africa">Africa</option>
                <option value="worldwide">Worldwide</option>
                <option value="emea">EMEA</option>
                <option value="named_countries">Named countries</option>
                <option value="restricted_region">Restricted region</option>
                <option value="unclear">Unclear</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="included_countries">Included countries</label>
              <input
                className="input"
                id="included_countries"
                name="included_countries"
                maxLength={1000}
              />
            </div>
            <div className="field">
              <label htmlFor="excluded_countries">Excluded countries</label>
              <input
                className="input"
                id="excluded_countries"
                name="excluded_countries"
                maxLength={1000}
              />
            </div>
            <div className="field">
              <label htmlFor="timezone_overlap">Timezone overlap</label>
              <input
                className="input"
                id="timezone_overlap"
                name="timezone_overlap"
                maxLength={300}
              />
            </div>
            <div className="field">
              <label htmlFor="work_authorization">
                Work authorisation requirement
              </label>
              <textarea
                className="textarea"
                id="work_authorization"
                name="work_authorization"
                maxLength={500}
              />
            </div>
            <div className="field">
              <label htmlFor="visa_sponsorship">Visa sponsorship</label>
              <select
                className="select"
                id="visa_sponsorship"
                name="visa_sponsorship"
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
                <option value="unclear">Unclear</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="eligibility_evidence">
              Exact evidence shown to candidates
            </label>
            <textarea
              className="textarea"
              id="eligibility_evidence"
              name="eligibility_evidence"
              maxLength={2000}
              required
            />
          </div>
        </fieldset>
        <fieldset>
          <legend>Pay and application</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="salary_minimum">Salary minimum</label>
              <input
                className="input"
                id="salary_minimum"
                name="salary_minimum"
                type="number"
                min="0"
              />
            </div>
            <div className="field">
              <label htmlFor="salary_maximum">Salary maximum</label>
              <input
                className="input"
                id="salary_maximum"
                name="salary_maximum"
                type="number"
                min="0"
              />
            </div>
            <div className="field">
              <label htmlFor="currency">Currency</label>
              <input
                className="input"
                id="currency"
                name="currency"
                pattern="[A-Z]{3}"
                maxLength={3}
                placeholder="NGN"
              />
            </div>
            <div className="field">
              <label htmlFor="pay_period">Pay period</label>
              <select className="select" id="pay_period" name="pay_period">
                <option value="unknown">Not stated</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="gross_net">Gross or net</label>
              <select className="select" id="gross_net" name="gross_net">
                <option value="unknown">Not stated</option>
                <option value="gross">Gross</option>
                <option value="net">Net</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="deadline">Deadline</label>
              <input
                className="input"
                id="deadline"
                name="deadline"
                type="date"
              />
            </div>
            <div className="field">
              <label htmlFor="application_url">External application URL</label>
              <input
                className="input"
                id="application_url"
                name="application_url"
                type="url"
                placeholder="https://"
                required
              />
            </div>
          </div>
        </fieldset>
        <label className="checkbox">
          <input type="checkbox" name="authorization_attestation" required />I
          confirm that I am authorised to publish this vacancy and that no
          applicant must pay a fee to apply.
        </label>
        <button className="button w-fit" type="submit">
          Submit for moderation
        </button>
      </form>
    </div>
  );
}
