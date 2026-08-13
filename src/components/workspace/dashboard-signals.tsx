import Link from "next/link";

import type {
  DashboardApplications,
  DashboardDeadline,
  DashboardPipelineEntry,
  DashboardSummary,
} from "@/lib/career/dashboard";
import type { DashboardAction } from "@/lib/career/dashboard-actions";
import type { DeadlineUrgency } from "@/lib/career/pipeline";
import type { RepositoryReadState } from "@/lib/data/repository-result";
import { formatDate, formatEnum } from "@/lib/format";
import {
  jobContextFromApplication,
  withJobContext,
} from "@/lib/product/job-context";

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
  application: DashboardApplications["active"][number];
}) {
  const notes = [
    `${application.companyName} · updated ${formatDate(application.updatedAt)}`,
  ];
  if (application.stalled) notes.push("no change in over two weeks");
  if (application.deadline) notes.push(application.deadline.description);
  return <p className="source-note m-0">{notes.join(" · ")}</p>;
}

const ACTION_POSITION_LABELS = ["Now", "Next", "Also"] as const;

/**
 * A short work list derived only from the owner's records.
 *
 * The order is meaningful, so this stays an ordered list. The labels use
 * ordinary planning language rather than a score: SalaryPadi can know that a
 * user-set date passed, but it cannot know which career decision matters most
 * to the person beyond those recorded facts.
 */
export function DashboardActionList({
  actions,
  incomplete = false,
}: {
  actions: DashboardAction[];
  incomplete?: boolean;
}) {
  if (actions.length === 0) return null;

  return (
    <section className="dashboard-actions stack" aria-labelledby="next-move">
      <div className="stack">
        <h2 className="section-title" id="next-move">
          Move one decision forward
        </h2>
        <p className="text-muted m-0">
          {incomplete
            ? "This list uses only the private sections that loaded. Missing sections do not count as zero and do not influence the order."
            : "This order comes only from the dates, statuses and profile details in your private workspace. SalaryPadi does not predict hiring outcomes."}
        </p>
      </div>
      <ol className="dashboard-action-list">
        {actions.map((action, index) => (
          <li
            className="dashboard-action"
            data-tone={action.tone}
            key={action.id}
          >
            <div className="stack">
              <p className="dashboard-action-position m-0">
                {ACTION_POSITION_LABELS[index] ?? "Also"}
              </p>
              <h3 className="m-0 text-lg font-bold">{action.title}</h3>
              <p className="source-note m-0">{action.detail}</p>
            </div>
            <Link className="button button-secondary" href={action.href}>
              {action.linkLabel}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * A section-level failure shown where an empty state would otherwise appear.
 * The wording is deliberately explicit that no total or absence claim can be
 * made from a failed read.
 */
export function DashboardSectionStatus({
  state,
  title,
}: {
  state: Exclude<RepositoryReadState, "ready">;
  title: string;
}) {
  return (
    <div className="notice notice-warning" role="status">
      <strong>{title} not shown.</strong>{" "}
      {state === "degraded"
        ? "Some records could not be verified, so this overview is not showing a total or an empty state."
        : state === "unconfigured"
          ? "The private account backend is not configured in this environment. No total or empty state is being inferred."
          : "The private records could not be read. No total or empty state is being inferred; reload and try again."}
    </div>
  );
}

/**
 * The four local decision tools as one honest workflow. Every tool remains
 * public; a signed-in workspace adds only the role/application context the
 * owner has already recorded.
 */
export function DashboardDecisionTools({
  summary,
}: {
  summary: DashboardSummary;
}) {
  const contextSource =
    summary.applications.data?.active.find(
      (application) => application.status === "offer",
    ) ??
    summary.applications.data?.active[0] ??
    summary.savedJobs.data?.recent[0] ??
    null;
  const context = contextSource
    ? {
        slug: contextSource.jobSlug,
        title: contextSource.title,
        companyName: contextSource.companyName,
        companySlug: null,
      }
    : null;
  const offerHref = context
    ? withJobContext("/tools/offer-compare", jobContextFromApplication(context))
    : "/tools/offer-compare";
  const scamHref = context
    ? withJobContext(
        "/tools/job-scam-checker",
        jobContextFromApplication(context),
      )
    : "/tools/job-scam-checker";
  const tools = [
    {
      stage: "1 · Check",
      title: "Screen a vacancy or recruiter message",
      detail:
        "See which warning signs are present before you share money, credentials or documents.",
      href: scamHref,
      label: "Check vacancy",
    },
    {
      stage: "2 · Translate",
      title: "Convert a stated salary",
      detail:
        "Use a source-labelled unit rate while keeping the salary amount out of the provider request.",
      href: "/tools/salary-converter",
      label: "Convert pay",
    },
    {
      stage: "3 · Calculate",
      title: "Estimate Nigeria take-home pay",
      detail:
        "Run gross-to-net or net-to-gross against versioned PAYE rules and visible assumptions.",
      href: "/tools/take-home-pay",
      label: "Estimate net",
    },
    {
      stage: "4 · Compare",
      title: "Put two written offers side by side",
      detail:
        "Compare pay, benefits, work costs and contract terms without declaring a winner for you.",
      href: offerHref,
      label: "Compare offers",
    },
  ];

  return (
    <section
      className="decision-workflow stack"
      aria-labelledby="decision-tools-heading"
    >
      <div className="split">
        <div className="stack">
          <h2 className="section-title" id="decision-tools-heading">
            Decision tools
          </h2>
          <p className="text-muted m-0">
            Use only the steps this decision needs. The tools work without an
            account; your workspace carries a recorded role into the relevant
            checks and comparisons.
          </p>
        </div>
        <Link className="text-link" href="/tools">
          See every career tool
        </Link>
      </div>
      <ol className="decision-workflow-list">
        {tools.map((tool) => (
          <li className="decision-workflow-step" key={tool.stage}>
            <div className="stack">
              <p className="decision-workflow-stage m-0">{tool.stage}</p>
              <h3 className="m-0 text-lg font-bold">{tool.title}</h3>
              <p className="source-note m-0">{tool.detail}</p>
            </div>
            <Link className="button button-secondary" href={tool.href}>
              {tool.label}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
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
