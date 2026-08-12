import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

import {
  buildJobDecisionPlan,
  type JobDecisionAction,
  type JobDecisionCheck,
} from "@/lib/jobs/decision-plan";
import type { Job } from "@/lib/jobs/types";
import { jobContextFrom, withJobContext } from "@/lib/product/job-context";

function actionFor(job: Job, action: JobDecisionAction | null) {
  switch (action) {
    case "source":
      return {
        external: true,
        href: job.sourceUrl,
        label: "Check source",
      };
    case "scam_check":
      return {
        external: false,
        href: withJobContext("/tools/job-scam-checker", jobContextFrom(job)),
        label: "Check warning signs",
      };
    case "take_home":
      return {
        external: false,
        href: withJobContext("/tools/take-home-pay", jobContextFrom(job)),
        label: "Estimate take-home",
      };
    case "salary_evidence":
      return {
        external: false,
        href: `/companies/${job.company.slug}/salaries`,
        label: "Review salary evidence",
      };
    case null:
      return null;
  }
}

function DecisionActionLink({
  check,
  job,
}: {
  check: JobDecisionCheck;
  job: Job;
}) {
  const action = actionFor(job, check.action);
  if (!action) return null;
  if (action.external) {
    return (
      <a
        className="text-link job-decision-action"
        href={action.href}
        rel="noopener noreferrer nofollow"
        target="_blank"
      >
        {action.label} <ExternalLink aria-hidden="true" size={14} />
      </a>
    );
  }
  return (
    <Link className="text-link job-decision-action" href={action.href}>
      {action.label} <ArrowRight aria-hidden="true" size={14} />
    </Link>
  );
}

function StateIcon({ state }: { state: JobDecisionCheck["state"] }) {
  if (state === "ready") return <CircleCheck aria-hidden="true" size={18} />;
  if (state === "check") return <CircleAlert aria-hidden="true" size={18} />;
  return <CircleDashed aria-hidden="true" size={18} />;
}

export function JobDecisionReadiness({
  job,
  variant = "full",
}: {
  job: Job;
  variant?: "full" | "compact";
}) {
  const plan = buildJobDecisionPlan(job);
  if (variant === "compact") {
    const primary = plan.primary;
    return (
      <section
        className="job-decision-compact"
        aria-label="Best next application check"
      >
        <p className="eyebrow">Best next check</p>
        {primary ? (
          <>
            <strong>{primary.label}</strong>
            <small>{primary.detail}</small>
            <DecisionActionLink check={primary} job={job} />
          </>
        ) : (
          <>
            <strong>Core application evidence is covered</strong>
            <small>
              Eligibility, freshness, role details and application destination
              have no unresolved warning in this listing.
            </small>
          </>
        )}
      </section>
    );
  }

  return (
    <section
      className="job-decision-readiness"
      aria-labelledby="job-decision-readiness-heading"
    >
      <header>
        <p className="eyebrow">Application readiness</p>
        <h2 className="section-title" id="job-decision-readiness-heading">
          {plan.unresolvedCount === 0
            ? "Core evidence checks are covered"
            : `${plan.unresolvedCount} ${plan.unresolvedCount === 1 ? "check deserves" : "checks deserve"} attention`}
        </h2>
        <p className="text-muted m-0">
          Prioritised from the source, eligibility, freshness, description and
          pay evidence held for this role. This is not a fit score.
        </p>
      </header>
      <ul className="job-decision-list">
        {plan.checks.map((check) => (
          <li data-state={check.state} key={check.id}>
            <span className="job-decision-icon">
              <StateIcon state={check.state} />
              <span className="visually-hidden">
                {check.state === "ready"
                  ? "Covered"
                  : check.state === "check"
                    ? "Check"
                    : "Optional"}
              </span>
            </span>
            <span>
              <strong>{check.label}</strong>
              <small>{check.detail}</small>
            </span>
            <DecisionActionLink check={check} job={job} />
          </li>
        ))}
      </ul>
    </section>
  );
}
