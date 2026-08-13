import type { DashboardSummary } from "@/lib/career/dashboard";
import {
  jobContextFromApplication,
  withJobContext,
} from "@/lib/product/job-context";

export type DashboardActionTone = "attention" | "decision" | "setup";

export interface DashboardAction {
  id: string;
  title: string;
  detail: string;
  href: string;
  linkLabel: string;
  tone: DashboardActionTone;
}

const MAX_DASHBOARD_ACTIONS = 3;

/**
 * Turn the account owner's own records into a short, deterministic work list.
 *
 * This deliberately does not score the person, predict an outcome or infer an
 * employer's intent. It only ranks facts already visible elsewhere in their
 * workspace: dates they set, statuses they recorded and fields they left
 * unstated. A section that did not load contributes no action; successfully
 * loaded sections can still help without borrowing assumptions from failures.
 */
export function getDashboardActions(
  summary: DashboardSummary,
): DashboardAction[] {
  const actions: DashboardAction[] = [];
  const used = new Set<string>();
  const add = (action: DashboardAction) => {
    if (used.has(action.id)) return;
    used.add(action.id);
    actions.push(action);
  };

  const applications = summary.applications.data;
  const overdue = applications?.upcomingActions.find(
    (action) => action.urgency === "overdue",
  );
  if (overdue) {
    add({
      id: `overdue:${overdue.jobSlug}`,
      title: `Update ${overdue.title}`,
      detail: `${overdue.description}. Move the date on or record where the process now stands.`,
      href: "/applications",
      linkLabel: "Review tracker",
      tone: "attention",
    });
  }

  const offer = applications?.active.find(
    (application) => application.status === "offer",
  );
  if (offer) {
    add({
      id: `offer:${offer.jobSlug}`,
      title: "Compare the written offer",
      detail: `Start with ${offer.title} at ${offer.companyName}; enter the terms from the offer itself, not the old vacancy.`,
      href: withJobContext(
        "/tools/offer-compare",
        jobContextFromApplication({
          slug: offer.jobSlug,
          title: offer.title,
          companyName: offer.companyName,
          companySlug: null,
        }),
      ),
      linkLabel: "Compare offers",
      tone: "decision",
    });
  }

  const stalled = applications?.active.find(
    (application) =>
      application.stalled && application.jobSlug !== overdue?.jobSlug,
  );
  if (stalled) {
    add({
      id: `stalled:${stalled.jobSlug}`,
      title: `Check in on ${stalled.title}`,
      detail: `This record has not changed in over two weeks. Add the latest status or set a next-action date.`,
      href: "/applications",
      linkLabel: "Update application",
      tone: "attention",
    });
  }

  const withoutNextAction = applications?.active.find(
    (application) =>
      application.deadline === null &&
      !application.stalled &&
      application.jobSlug !== overdue?.jobSlug &&
      application.jobSlug !== offer?.jobSlug,
  );
  if (withoutNextAction) {
    add({
      id: `schedule:${withoutNextAction.jobSlug}`,
      title: `Set the next step for ${withoutNextAction.title}`,
      detail:
        "Record the next date or follow-up you control, so this process has a concrete return point.",
      href: "/applications",
      linkLabel: "Plan next action",
      tone: "setup",
    });
  }

  const profile = summary.profile.data;
  if (profile && profile.missingFields.length > 0) {
    const count = profile.missingFields.length;
    add({
      id: "profile",
      title: profile.exists
        ? "Finish the profile fields used for matches"
        : "Create your private career profile",
      detail: profile.exists
        ? `${count} ${count === 1 ? "field is" : "fields are"} still unstated. SalaryPadi uses only your own claims to improve matching.`
        : "State the role, experience and work preferences SalaryPadi may use for matching.",
      href: "/account/candidate-profile",
      linkLabel: profile.exists ? "Finish profile" : "Create profile",
      tone: "setup",
    });
  }

  if (summary.alerts.data?.activeCount === 0) {
    add({
      id: "alert",
      title: "Keep one useful search running",
      detail:
        "Create an alert from criteria you choose, then pause or remove it whenever it stops helping.",
      href: "/alerts",
      linkLabel: "Create alert",
      tone: "setup",
    });
  }

  const saved = summary.savedJobs.data?.recent[0];
  if (saved) {
    add({
      id: `saved:${saved.jobSlug}`,
      title: `Decide whether to apply for ${saved.title}`,
      detail: `Recheck the source, eligibility and employer evidence before moving it into your tracker.`,
      href: `/jobs/${saved.jobSlug}`,
      linkLabel: "Review role",
      tone: "decision",
    });
  }

  if (actions.length === 0 && summary.state === "ready") {
    add({
      id: "discover",
      title: "Find the next role worth reviewing",
      detail:
        "Start with roles whose source and Nigeria eligibility are shown clearly.",
      href: "/jobs",
      linkLabel: "Find jobs",
      tone: "decision",
    });
  }

  return actions.slice(0, MAX_DASHBOARD_ACTIONS);
}
