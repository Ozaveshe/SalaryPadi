import Link from "next/link";

import type {
  DashboardDeadline,
  DashboardPipelineEntry,
  DashboardSummary,
} from "@/lib/career/dashboard";
import type { DeadlineUrgency } from "@/lib/career/pipeline";
import { formatDate, formatEnum } from "@/lib/format";

/**
 * The parts of the overview that read the account owner's own records back to
 * them as signals rather than as counts.
 *
 * Presentation only. Every figure and phrase arrives already derived, so the
 * rules deciding what counts as overdue, stalled or live stay testable without
 * a renderer, and this file cannot disagree with the tracker.
 */

/**
 * Urgency reaches colour only where colour is honest. A date that has passed is
 * a real failure state; one landing today or tomorrow needs attention today;
 * anything further out is just a date, and colouring it would spend the reader's
 * alarm on nothing.
 */
const URGENCY_STATUS_CLASS: Record<DeadlineUrgency, string> = {
  overdue: "status status-danger",
  today: "status status-warning",
  tomorrow: "status status-warning",
  upcoming: "status status-neutral",
};

/**
 * Scheduled next actions, soonest first.
 *
 * The date stays visible beside the relative phrase: "Overdue by 3 days" is
 * what the reader acts on, but only the date itself is what they entered.
 */
export function DeadlineList({
  deadlines,
}: {
  deadlines: DashboardDeadline[];
}) {
  return (
    <ul className="private-list">
      {deadlines.map((deadline) => (
        <li
          className="private-row"
          key={`${deadline.jobSlug}-${deadline.dueAt}`}
        >
          <div className="stack">
            <Link className="text-link" href={`/jobs/${deadline.jobSlug}`}>
              {deadline.title}
            </Link>
            <p className="source-note m-0">
              {deadline.companyName} · {formatDate(deadline.dueAt)}
            </p>
          </div>
          <span className={URGENCY_STATUS_CLASS[deadline.urgency]}>
            {deadline.description}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Where the live applications actually sit.
 *
 * A single "live" count cannot tell four first-round applications apart from an
 * offer in hand, and those two positions call for opposite next moves.
 */
export function PipelineSummary({
  pipeline,
}: {
  pipeline: DashboardPipelineEntry[];
}) {
  return (
    <ul className="pipeline-summary" aria-label="Live applications by stage">
      {pipeline.map((entry) => (
        <li key={entry.status}>
          <span
            className={
              // An offer is the one stage that is unambiguously good news; the
              // rest are positions, not verdicts, so they stay neutral.
              entry.status === "offer"
                ? "status status-success"
                : "status status-neutral"
            }
          >
            {entry.count} {formatEnum(entry.status)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * What a live application's own dates say about it, as one metadata line.
 *
 * Staleness is reported before the deadline because an untouched record is the
 * more likely explanation for a passed date than a missed one.
 */
export function ApplicationRowNote({
  application,
}: {
  application: DashboardSummary["activeApplications"][number];
}) {
  const notes = [
    `${application.companyName} · updated ${formatDate(application.updatedAt)}`,
  ];
  if (application.stalled) notes.push("no change in over two weeks");
  if (application.deadline) notes.push(application.deadline.description);
  return <p className="source-note m-0">{notes.join(" · ")}</p>;
}

/**
 * The first thing a new account sees.
 *
 * A fresh account has nothing to summarise, and four zeros beside two empty
 * columns reads as a broken page rather than as a starting point. These are the
 * three steps that make the rest of the overview say something, in the order
 * they pay off.
 */
export function FirstRunGuide({ profileExists }: { profileExists: boolean }) {
  return (
    <section className="surface surface-pad stack" aria-label="Getting started">
      <div className="stack">
        <h2 className="section-title">Set up your workspace</h2>
        <p className="text-muted m-0">
          Nothing is tracked yet. These three steps are what the overview
          summarises, and all of them stay private to your account.
        </p>
      </div>
      {/* The step content sits in a wrapper rather than on the `li` itself: a
          list item styled as a grid stops computing to `list-item`, and the
          step numbers would silently disappear. */}
      <ol className="first-run-steps">
        <li>
          <div className="stack">
            <Link className="text-link" href="/jobs">
              Browse roles open to Nigeria
            </Link>
            <p className="source-note m-0">
              Save the ones worth a second look, then mark the ones you apply
              for.
            </p>
          </div>
        </li>
        <li>
          <div className="stack">
            <Link className="text-link" href="/account/candidate-profile">
              {profileExists
                ? "Finish your career profile"
                : "Add a career profile"}
            </Link>
            <p className="source-note m-0">
              Your own claims about your experience and pay expectation, used to
              sharpen which roles match.
            </p>
          </div>
        </li>
        <li>
          <div className="stack">
            <Link className="text-link" href="/alerts">
              Create a job alert
            </Link>
            <p className="source-note m-0">
              Email for new matches on a search you own, on your cadence.
            </p>
          </div>
        </li>
      </ol>
    </section>
  );
}
