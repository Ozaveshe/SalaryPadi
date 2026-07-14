import type { Metadata } from "next";

import { ContributionShell } from "@/components/contributions/contribution-shell";
import { DraftControls } from "@/components/contributions/draft-controls";
import { requireViewer } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Submit interview experience",
  robots: { index: false, follow: false },
};

export default async function InterviewContributionPage() {
  await requireViewer("/contribute/interview");
  return (
    <ContributionShell
      title="Share an interview experience"
      description="Describe the process, duration and question themes without sharing confidential material or exact proprietary test answers."
    >
      <form
        id="interview-contribution-form"
        className="contribution-form"
        action="/api/contributions/interview"
        method="post"
      >
        <fieldset>
          <legend>Role and application</legend>
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
              <label htmlFor="seniority">Seniority</label>
              <select className="select" id="seniority" name="seniority">
                <option value="entry">Entry</option>
                <option value="mid">Mid-level</option>
                <option value="senior">Senior</option>
                <option value="lead">Lead</option>
                <option value="executive">Executive</option>
              </select>
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
              <label htmlFor="application_source">How did you apply?</label>
              <input
                className="input"
                id="application_source"
                name="application_source"
                maxLength={160}
                required
              />
            </div>
          </div>
        </fieldset>
        <fieldset>
          <legend>Process</legend>
          <div className="stack">
            <div className="field">
              <label htmlFor="stages">Interview stages</label>
              <textarea
                className="textarea"
                id="stages"
                name="stages"
                maxLength={2000}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="assessment">
                Assessment or assignment (general description)
              </label>
              <textarea
                className="textarea"
                id="assessment"
                name="assessment"
                maxLength={1000}
              />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="duration">Approximate duration</label>
                <select className="select" id="duration" name="duration">
                  <option value="under_1_week">Under 1 week</option>
                  <option value="1_to_2_weeks">1–2 weeks</option>
                  <option value="2_to_4_weeks">2–4 weeks</option>
                  <option value="1_to_2_months">1–2 months</option>
                  <option value="over_2_months">Over 2 months</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="difficulty">Difficulty (1–5)</label>
                <select
                  className="select"
                  id="difficulty"
                  name="difficulty"
                  defaultValue="3"
                >
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <option value={rating} key={rating}>
                      {rating}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="feedback_received">Feedback received</label>
                <select
                  className="select"
                  id="feedback_received"
                  name="feedback_received"
                >
                  <option value="yes">Yes</option>
                  <option value="partial">Partial</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="outcome">Outcome</label>
                <select className="select" id="outcome" name="outcome">
                  <option value="offer">Offer</option>
                  <option value="rejected">Rejected</option>
                  <option value="withdrawn">Withdrew</option>
                  <option value="ghosted">No response</option>
                  <option value="in_progress">Still in progress</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="question_themes">Question themes</label>
              <textarea
                className="textarea"
                id="question_themes"
                name="question_themes"
                maxLength={1500}
              />
            </div>
            <div className="field">
              <label htmlFor="general_experience">General experience</label>
              <textarea
                className="textarea"
                id="general_experience"
                name="general_experience"
                maxLength={2000}
                required
              />
            </div>
          </div>
        </fieldset>
        <label className="checkbox">
          <input type="checkbox" name="confidentiality_attestation" required />I
          have not included exact proprietary test answers, private contact
          details or confidential company material.
        </label>
        <button className="button w-fit" type="submit">
          Submit for moderation
        </button>
        <DraftControls formId="interview-contribution-form" kind="interview" />
      </form>
    </ContributionShell>
  );
}
