import type { Metadata } from "next";

import { PageHeading } from "@/components/page-heading";
import { requireViewer } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Company intelligence request",
  robots: { index: false, follow: false, nocache: true },
};

export default async function CompanyIntelligenceRequestsPage() {
  await requireViewer("/company-intelligence/requests");
  return (
    <div className="reading-shell stack-lg">
      <PageHeading
        eyebrow="Private reviewed request"
        title="Report, correct, appeal or request takedown"
        description="Choose the record and minimum necessary reason. Reviewers and employers use the same audited workflow; employers never receive contributor identity."
      />
      <form
        className="surface surface-pad contribution-form"
        action="/api/reports"
        method="post"
      >
        <input
          type="hidden"
          name="return_to"
          value="/company-intelligence/requests"
        />
        <div className="form-grid">
          <div className="field">
            <label htmlFor="target_type">Record type</label>
            <select className="select" id="target_type" name="target_type">
              <option value="company">Company fact</option>
              <option value="review">Workplace review</option>
              <option value="salary">Salary aggregate</option>
              <option value="benefit">Benefit aggregate</option>
              <option value="pay_reliability">Pay reliability aggregate</option>
              <option value="interview">Interview experience</option>
              <option value="employer_response">Employer response</option>
              <option value="contribution">My contribution</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="category">Request</label>
            <select className="select" id="category" name="category">
              <option value="incorrect">Report inaccurate information</option>
              <option value="correction">Submit a factual correction</option>
              <option value="privacy">
                Report privacy or re-identification risk
              </option>
              <option value="serious_allegation">
                Flag a serious allegation
              </option>
              <option value="appeal">Appeal a moderation decision</option>
              <option value="takedown">Request takedown review</option>
              <option value="deletion">Request deletion review</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="target_id">Record ID or company slug</label>
          <input
            className="input"
            id="target_id"
            name="target_id"
            maxLength={220}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="narrative">Minimum necessary explanation</label>
          <textarea
            className="textarea"
            id="narrative"
            name="narrative"
            maxLength={2000}
          />
          <p className="field-help">
            Do not paste identity documents, private contact details, payslips
            or confidential files.
          </p>
        </div>
        <button className="button w-fit" type="submit">
          Submit for reviewed action
        </button>
      </form>
      <div className="notice">
        Contribution and account deletion requests can also be tracked in the
        private privacy request centre. Emergency threats or exposed personal
        data are escalated by moderation policy.
      </div>
    </div>
  );
}
