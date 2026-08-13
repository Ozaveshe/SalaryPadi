import Link from "next/link";

import type { JobContext } from "@/lib/product/job-context";
import { withJobContext } from "@/lib/product/job-context";

export type LocalDecisionTool =
  "take-home" | "salary-converter" | "offer-compare" | "scam-checker";

type NextStep = {
  href: string;
  title: string;
  detail: string;
};

function carry(path: string, context: JobContext | null): string {
  return context ? withJobContext(path, context) : path;
}

function stepsFor(
  current: LocalDecisionTool,
  context: JobContext | null,
): NextStep[] {
  switch (current) {
    case "take-home":
      return [
        {
          href: carry("/tools/offer-compare", context),
          title: "Compare the full offer",
          detail: "Add benefits, work costs and contract terms beside pay.",
        },
        {
          href: "/salaries",
          title: "Check salary evidence",
          detail:
            "See whether reviewed evidence exists for the role and market.",
        },
        {
          href: "/applications",
          title: "Update your tracker",
          detail: "Record the status and next action for an application.",
        },
      ];
    case "salary-converter":
      return [
        {
          href: carry("/tools/offer-compare", context),
          title: "Compare two offers",
          detail: "Normalize pay periods and show the FX evidence used.",
        },
        {
          href: "/tools/take-home-pay",
          title: "Estimate Nigeria take-home",
          detail: "Enter the naira salary you want to test against PAYE rules.",
        },
        {
          href: "/salaries",
          title: "Check salary evidence",
          detail: "Keep a converted amount separate from a market benchmark.",
        },
      ];
    case "offer-compare": {
      const contributionParams = context
        ? new URLSearchParams({
            role: context.title,
            company: context.company,
          }).toString()
        : "";
      return [
        {
          href: "/applications",
          title: "Record what happens next",
          detail:
            "Keep the application status and your next-action date current.",
        },
        {
          href: "/salaries",
          title: "Check salary evidence",
          detail:
            "Compare your own terms with published evidence without mixing them.",
        },
        {
          href: contributionParams
            ? `/contribute/salary?${contributionParams}`
            : "/contribute/salary",
          title: "Contribute salary evidence",
          detail:
            "Share what you can after the process, with privacy controls.",
        },
      ];
    }
    case "scam-checker":
      return [
        {
          href: "/jobs",
          title: "Search source-attributed roles",
          detail:
            "Start again from a listing whose source and eligibility are visible.",
        },
        {
          href: "/trust-and-safety",
          title: "Review the safety process",
          detail:
            "See what SalaryPadi checks, what it cannot prove and how to report harm.",
        },
        {
          href: context ? `/jobs/${context.slug}` : "/companies",
          title: context ? "Return to the role" : "Check employer evidence",
          detail: context
            ? "Reopen the source, eligibility wording and verified apply destination."
            : "Look for reviewed employer, interview and salary evidence.",
        },
      ];
  }
}

/**
 * Keep each calculator inside the wider career decision instead of ending on
 * a number. Links are ordinary server-rendered navigation and work without
 * client JavaScript; only the public job context is carried between tools.
 */
export function ToolDecisionPath({
  current,
  context = null,
}: {
  current: LocalDecisionTool;
  context?: JobContext | null;
}) {
  return (
    <section className="tool-next-steps stack" aria-labelledby="tool-next-step">
      <div className="stack">
        <h2 className="section-title" id="tool-next-step">
          Continue the decision
        </h2>
        <p className="text-muted m-0">
          A calculation is one input, not the conclusion. Keep the role,
          evidence and your own priorities separate as you move on.
        </p>
      </div>
      <ul className="tool-next-step-list">
        {stepsFor(current, context).map((step) => (
          <li key={step.href}>
            <Link className="tool-next-step-link" href={step.href}>
              <span className="font-bold">{step.title}</span>
              <span className="source-note">{step.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
