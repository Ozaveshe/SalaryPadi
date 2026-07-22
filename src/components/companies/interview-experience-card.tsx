import { formatDate, formatEnum } from "@/lib/format";
import type { InterviewExperience } from "@/lib/companies/contracts";

const FRESHNESS_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * One published interview report. Freshness is first-class: recent reports
 * carry a highlighted date, older ones an explicit "process may have
 * changed" caution — a stale interview loop presented as current is
 * misinformation, not evidence.
 */
export function InterviewExperienceCard({
  interview,
  now = new Date(),
}: {
  interview: InterviewExperience;
  now?: Date;
}) {
  const publishedAt = Date.parse(interview.published_at);
  const isRecent =
    Number.isFinite(publishedAt) &&
    now.valueOf() - publishedAt < FRESHNESS_WINDOW_MS;

  return (
    <article className="surface surface-pad stack interview-card">
      <div className="split">
        <div>
          <p className="eyebrow">
            {[
              interview.role_family,
              interview.seniority,
              interview.country_code,
            ]
              .filter(Boolean)
              .map((value) => formatEnum(String(value)))
              .join(" · ") || "Role not stated"}
          </p>
          <h3 className="m-0 text-lg font-bold">Interview experience</h3>
        </div>
        <span
          className={`status ${isRecent ? "status-success" : "status-neutral"}`}
        >
          {isRecent
            ? `Reported ${formatDate(interview.published_at)}`
            : `Older report · ${formatDate(interview.published_at)}`}
        </span>
      </div>
      <div className="job-badges" aria-label="Interview outcome summary">
        {interview.difficulty !== null ? (
          <span className="status status-neutral">
            Difficulty {interview.difficulty}/5
          </span>
        ) : null}
        {interview.outcome ? (
          <span
            className={`status ${
              interview.outcome === "offer_accepted" ||
              interview.outcome === "offer_received"
                ? "status-success"
                : "status-neutral"
            }`}
          >
            {formatEnum(interview.outcome)}
          </span>
        ) : null}
        {interview.approximate_duration_label ? (
          <span className="status status-neutral">
            {interview.approximate_duration_label}
          </span>
        ) : null}
        {interview.feedback_received !== null ? (
          <span
            className={`status ${
              interview.feedback_received ? "status-success" : "status-warning"
            }`}
          >
            {interview.feedback_received
              ? "Feedback received"
              : "No feedback received"}
          </span>
        ) : null}
        {interview.application_source ? (
          <span className="status status-neutral">
            Applied via {formatEnum(interview.application_source)}
          </span>
        ) : null}
      </div>
      {interview.stages.length > 0 ? (
        <div>
          <p className="source-note m-0">Process stages, in order</p>
          <ol className="interview-stage-list">
            {interview.stages.map((stage, index) => (
              <li key={`${index}-${stage}`}>{stage}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {interview.question_themes ? (
        <div>
          <p className="source-note m-0">Question themes asked</p>
          <p className="m-0">{interview.question_themes}</p>
        </div>
      ) : null}
      {interview.general_experience ? (
        <div>
          <p className="source-note m-0">How it went</p>
          <p className="m-0">{interview.general_experience}</p>
        </div>
      ) : null}
      {!isRecent ? (
        <p className="field-help m-0">
          This report is over a year old; the process may have changed.
        </p>
      ) : null}
      <p className="source-note m-0">{interview.provenance_label}</p>
    </article>
  );
}
