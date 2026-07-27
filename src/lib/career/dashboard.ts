import "server-only";

import {
  getAlerts,
  getApplications,
  getCandidateProfile,
  getSavedJobs,
} from "@/lib/career/repository";
import type { RepositoryReadState } from "@/lib/data/repository-result";

/** Application statuses that represent a live, in-flight process. */
const ACTIVE_APPLICATION_STATUSES = new Set([
  "applied",
  "assessment",
  "interview",
  "offer",
]);

export type DashboardSummary = {
  /**
   * The weakest state across the four reads. One degraded section degrades the
   * dashboard, so a partial view is never presented as complete.
   */
  state: RepositoryReadState;
  savedJobCount: number;
  activeApplicationCount: number;
  activeAlertCount: number;
  /** Next scheduled action across all applications, if any. */
  nextAction: { jobSlug: string; title: string; dueAt: string } | null;
  recentSaved: {
    jobSlug: string;
    title: string;
    companyName: string;
    savedAt: string;
  }[];
  activeApplications: {
    jobSlug: string;
    title: string;
    companyName: string;
    status: string;
    updatedAt: string;
  }[];
  profile: {
    exists: boolean;
    headline: string | null;
    attestedAt: string | null;
    /** Completed share of the fields that drive job matching, 0-1. */
    completeness: number;
  };
};

/**
 * Severity order for the four reads. The dashboard reports the worst state any
 * section reached, so a partial view is never presented as a complete one.
 */
const STATE_SEVERITY: Record<RepositoryReadState, number> = {
  ready: 0,
  degraded: 1,
  invalid: 2,
  unavailable: 3,
  unconfigured: 4,
};

function weakestState(states: RepositoryReadState[]): RepositoryReadState {
  return states.reduce(
    (worst, state) =>
      STATE_SEVERITY[state] > STATE_SEVERITY[worst] ? state : worst,
    "ready" as RepositoryReadState,
  );
}

/**
 * Reads every private career surface the dashboard summarises.
 *
 * The four reads run concurrently because none depends on another, and a
 * dashboard that serialised them would pay four round trips before first paint.
 */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [saved, applications, alerts, profile] = await Promise.all([
    getSavedJobs(),
    getApplications(),
    getAlerts(),
    getCandidateProfile(),
  ]);

  const activeApplications = applications.data.filter((application) =>
    ACTIVE_APPLICATION_STATUSES.has(application.status),
  );

  const dueActions = applications.data
    .filter(
      (application) =>
        application.next_action_at !== null &&
        ACTIVE_APPLICATION_STATUSES.has(application.status),
    )
    .sort((a, b) =>
      (a.next_action_at ?? "").localeCompare(b.next_action_at ?? ""),
    );
  const soonest = dueActions[0];

  const profileRow = profile.data;
  // Only the fields that materially change which jobs match are counted, so the
  // figure means "how much of this improves your matches", not "fields filled".
  const matchingFields = profileRow
    ? [
        profileRow.headline,
        profileRow.experience_level,
        profileRow.desired_work_arrangement,
        profileRow.location_country,
        profileRow.desired_salary_min,
      ]
    : [];
  const completedFields = matchingFields.filter(
    (value) => value !== null && value !== undefined && value !== "unspecified",
  ).length;

  return {
    state: weakestState([
      saved.state,
      applications.state,
      alerts.state,
      profile.state,
    ]),
    savedJobCount: saved.data.length,
    activeApplicationCount: activeApplications.length,
    activeAlertCount: alerts.data.filter((alert) => alert.active).length,
    nextAction:
      soonest && soonest.next_action_at
        ? {
            jobSlug: soonest.job_slug,
            title: soonest.title,
            dueAt: soonest.next_action_at,
          }
        : null,
    recentSaved: saved.data.slice(0, 5).map((job) => ({
      jobSlug: job.job_slug,
      title: job.title,
      companyName: job.company_name,
      savedAt: job.saved_at,
    })),
    activeApplications: activeApplications.slice(0, 5).map((application) => ({
      jobSlug: application.job_slug,
      title: application.title,
      companyName: application.company_name,
      status: application.status,
      updatedAt: application.updated_at,
    })),
    profile: {
      exists: profileRow !== null,
      headline: profileRow?.headline ?? null,
      attestedAt: profileRow?.attested_at ?? null,
      completeness:
        matchingFields.length === 0
          ? 0
          : completedFields / matchingFields.length,
    },
  };
}
