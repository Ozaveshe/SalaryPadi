import Link from "next/link";

import { PageHeading } from "@/components/page-heading";
import { RepositoryNotice } from "@/components/repository-notice";
import { requireStaff } from "@/lib/auth/dal";
import { listOperatorJobIntakeResult } from "@/lib/admin/job-intake";
import { formatDate, formatEnum } from "@/lib/format";

const choices = {
  work_mode: ["remote", "hybrid", "onsite"],
  employment_type: [
    "full_time",
    "part_time",
    "contract",
    "temporary",
    "internship",
    "freelance",
  ],
  arrangement: ["employee", "contractor", "freelance"],
  experience_level: ["entry", "mid", "senior", "lead", "executive"],
  eligibility_scope: [
    "worldwide",
    "africa",
    "emea",
    "nigeria",
    "named_countries",
    "restricted_region",
    "unclear",
  ],
  visa_sponsorship: ["yes", "no", "unclear"],
  pay_period: ["hourly", "daily", "weekly", "monthly", "annual", "unknown"],
  gross_net: ["gross", "net", "unknown"],
} as const;

function SelectField({
  name,
  label,
  values,
}: {
  name: string;
  label: string;
  values: readonly string[];
}) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <select className="select" id={name} name={name} defaultValue="" required>
        <option value="" disabled>
          Choose
        </option>
        {values.map((value) => (
          <option value={value} key={value}>
            {formatEnum(value)}
          </option>
        ))}
      </select>
    </div>
  );
}

export default async function OperatorJobIntakePage() {
  await requireStaff(["data_quality", "admin"]);
  const result = await listOperatorJobIntakeResult();
  return (
    <div className="stack-lg">
      <PageHeading
        eyebrow="Protected job operations"
        title="Submit a source-backed job for moderation"
        description="Retain the original source and explicit eligibility evidence. This creates a pending moderation case; it never publishes a job directly."
      />
      <div className="notice notice-warning">
        <strong>Evidence is required.</strong> Copy only facts present at the
        retained source. Use “unclear” when the source does not answer an
        eligibility or sponsorship question. An AAL2 administrator must approve
        the case.
      </div>
      <form
        className="contribution-form"
        action="/api/admin/jobs/intake"
        method="post"
      >
        <fieldset>
          <legend>Source and intake decision</legend>
          <div className="form-grid">
            <div className="field field-span-2">
              <label htmlFor="source_url">Original job source URL</label>
              <input
                className="input"
                id="source_url"
                name="source_url"
                type="url"
                maxLength={2_000}
                required
              />
            </div>
            <div className="field field-span-2">
              <label htmlFor="source_evidence">
                What the source establishes
              </label>
              <textarea
                className="textarea"
                id="source_evidence"
                name="source_evidence"
                minLength={10}
                maxLength={2_000}
                required
              />
            </div>
            <div className="field field-span-2">
              <label htmlFor="intake_reason">
                Why this job belongs in SalaryPadi
              </label>
              <textarea
                className="textarea"
                id="intake_reason"
                name="intake_reason"
                minLength={3}
                maxLength={500}
                required
              />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Company and role</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="company_name">Company name</label>
              <input
                className="input"
                id="company_name"
                name="company_name"
                minLength={2}
                maxLength={200}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="company_website">
                Company website (optional)
              </label>
              <input
                className="input"
                id="company_website"
                name="company_website"
                type="url"
                maxLength={2_000}
              />
            </div>
            <div className="field field-span-2">
              <label htmlFor="title">Job title</label>
              <input
                className="input"
                id="title"
                name="title"
                minLength={2}
                maxLength={300}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="country_code">Country code</label>
              <input
                className="input"
                id="country_code"
                name="country_code"
                pattern="[A-Za-z]{2}"
                maxLength={2}
                placeholder="NG"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="location">Source location wording</label>
              <input
                className="input"
                id="location"
                name="location"
                minLength={2}
                maxLength={200}
                required
              />
            </div>
            <SelectField
              name="work_mode"
              label="Work mode"
              values={choices.work_mode}
            />
            <SelectField
              name="employment_type"
              label="Employment type"
              values={choices.employment_type}
            />
            <SelectField
              name="arrangement"
              label="Engagement"
              values={choices.arrangement}
            />
            <SelectField
              name="experience_level"
              label="Experience level"
              values={choices.experience_level}
            />
          </div>
        </fieldset>

        <fieldset>
          <legend>Eligibility evidence</legend>
          <div className="form-grid">
            <SelectField
              name="eligibility_scope"
              label="Who can apply"
              values={choices.eligibility_scope}
            />
            <SelectField
              name="visa_sponsorship"
              label="Visa sponsorship"
              values={choices.visa_sponsorship}
            />
            <div className="field field-span-2">
              <label htmlFor="eligibility_evidence">
                Exact eligibility evidence
              </label>
              <textarea
                className="textarea"
                id="eligibility_evidence"
                name="eligibility_evidence"
                minLength={5}
                maxLength={2_000}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="included_countries">
                Included countries (optional)
              </label>
              <input
                className="input"
                id="included_countries"
                name="included_countries"
                maxLength={1_000}
              />
            </div>
            <div className="field">
              <label htmlFor="excluded_countries">
                Excluded countries (optional)
              </label>
              <input
                className="input"
                id="excluded_countries"
                name="excluded_countries"
                maxLength={1_000}
              />
            </div>
            <div className="field">
              <label htmlFor="timezone_overlap">
                Timezone overlap (optional)
              </label>
              <input
                className="input"
                id="timezone_overlap"
                name="timezone_overlap"
                maxLength={300}
              />
            </div>
            <div className="field">
              <label htmlFor="work_authorization">
                Work authorization (optional)
              </label>
              <input
                className="input"
                id="work_authorization"
                name="work_authorization"
                maxLength={500}
              />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Pay and application</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="salary_minimum">Minimum salary (optional)</label>
              <input
                className="input"
                id="salary_minimum"
                name="salary_minimum"
                type="number"
                min="0"
                step="0.01"
              />
            </div>
            <div className="field">
              <label htmlFor="salary_maximum">Maximum salary (optional)</label>
              <input
                className="input"
                id="salary_maximum"
                name="salary_maximum"
                type="number"
                min="0"
                step="0.01"
              />
            </div>
            <div className="field">
              <label htmlFor="currency">Currency when pay is supplied</label>
              <input
                className="input"
                id="currency"
                name="currency"
                pattern="[A-Z]{3}"
                maxLength={3}
                placeholder="NGN"
              />
            </div>
            <SelectField
              name="pay_period"
              label="Pay period"
              values={choices.pay_period}
            />
            <SelectField
              name="gross_net"
              label="Gross or net"
              values={choices.gross_net}
            />
            <div className="field">
              <label htmlFor="deadline">Deadline (optional)</label>
              <input
                className="input"
                id="deadline"
                name="deadline"
                type="date"
              />
            </div>
            <div className="field field-span-2">
              <label htmlFor="application_url">Verified application URL</label>
              <input
                className="input"
                id="application_url"
                name="application_url"
                type="url"
                maxLength={2_000}
                required
              />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Retained job content</legend>
          <div className="form-grid">
            <div className="field field-span-2">
              <label htmlFor="description">Description</label>
              <textarea
                className="textarea"
                id="description"
                name="description"
                minLength={100}
                maxLength={20_000}
                required
              />
            </div>
            <div className="field field-span-2">
              <label htmlFor="requirements">Requirements</label>
              <textarea
                className="textarea"
                id="requirements"
                name="requirements"
                minLength={20}
                maxLength={10_000}
                required
              />
            </div>
            <div className="field field-span-2">
              <label htmlFor="benefits">Benefits (optional)</label>
              <textarea
                className="textarea"
                id="benefits"
                name="benefits"
                maxLength={5_000}
              />
            </div>
          </div>
        </fieldset>
        <button className="button" type="submit">
          Create pending moderation case
        </button>
      </form>

      <section className="stack" aria-labelledby="intake-queue-heading">
        <div>
          <p className="eyebrow">Operator intake</p>
          <h2 className="section-title" id="intake-queue-heading">
            Recent cases
          </h2>
        </div>
        <RepositoryNotice result={result} resource="Operator intake cases" />
        {result.data.length > 0 ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.title}</strong>
                      <span>{row.company_name}</span>
                    </td>
                    <td>
                      <a
                        href={row.source_url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                      >
                        Open source
                      </a>
                    </td>
                    <td>
                      <span className="status status-neutral">
                        {formatEnum(row.status)}
                      </span>
                    </td>
                    <td>{formatDate(row.submitted_at)}</td>
                    <td>
                      <Link
                        className="button button-secondary"
                        href={`/admin/jobs/intake/${row.id}`}
                      >
                        Open evidence
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">No operator intake cases are recorded.</p>
        )}
      </section>
    </div>
  );
}
