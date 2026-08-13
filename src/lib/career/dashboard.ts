import "server-only";

import {
  ACTIVE_APPLICATION_STATUSES,
  isActiveApplicationStatus,
  isStaleApplication,
  readDeadline,
  type ActiveApplicationStatus,
  type Deadline,
} from "@/lib/career/pipeline";
import {
  getAlerts,
  getApplications,
  getCandidateProfile,
  getSavedJobs,
  type CandidateProfileRow,
} from "@/lib/career/repository";
import type { RepositoryReadState } from "@/lib/data/repository-result";

/**
 * How many scheduled actions the overview lists. Enough to plan a week around
 * without turning the summary into a second copy of the tracker.
 */
const MAX_LISTED_ACTIONS = 4;

/** How many records each summary column shows before deferring to its page. */
const MAX_LISTED_RECORDS = 5;

/**
 * The profile fields that materially change which jobs match, in the order the
 * profile form asks for them. Only these are counted, so "profile strength"
 * means "how much of this improves your matches", not "fields filled".
 *
 * Labels match the form's own wording so the missing-field list reads as
 * directions to a specific input rather than as database column names.
 */
const MATCHING_FIELDS: {
  label: string;
  read: (row: CandidateProfileRow) => unknown;
}[] = [
  { label: "Headline", read: (row) => row.headline },
  { label: "Experience level", read: (row) => row.experience_level },
  {
    label: "Preferred work arrangement",
    read: (row) => row.desired_work_arrangement,
  },
  { label: "Country you live in", read: (row) => row.location_country },
  { label: "Minimum pay expectation", read: (row) => row.desired_salary_min },
];

/** Total number of fields "profile strength" is measured against. */
export const MATCHING_FIELD_COUNT = MATCHING_FIELDS.length;

/**
 * "Prefer not to say" is a deliberate answer, but it still leaves nothing to
 * match on, so it counts as unstated rather than as a completed field.
 */
function isStated(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "unspecified";
}

/** Labels of the matching fields not yet stated, in the form's own order. */
export function missingMatchingFields(
  row: CandidateProfileRow | null,
): string[] {
  if (!row) return MATCHING_FIELDS.map((field) => field.label);
  return MATCHING_FIELDS.filter((field) => !isStated(field.read(row))).map(
    (field) => field.label,
  );
}

/** A self-set next action, resolved against the clock. */
export type DashboardDeadline = Deadline & {
  jobSlug: string;
  title: string;
  companyName: string;
  dueAt: string;
};

export type DashboardPipelineEntry = {
  status: ActiveApplicationStatus;
  count: number;
};

/**
 * A dashboard section is either complete or intentionally carries no data.
 *
 * Repository failures use empty arrays and nulls as safe transport fallbacks.
 * Keeping those fallbacks in a summary would make it too easy for a renderer
 * to turn "could not read" into "you have none". This discriminated shape
 * makes a successful read a prerequisite for every count and empty state.
 */
export type DashboardSection<T> =
  | { state: "ready"; data: T }
  | {
      state: Exclude<RepositoryReadState, "ready">;
      data: null;
    };

export type DashboardSavedJobs = {
  count: number;
  recent: {
    jobSlug: string;
    title: string;
    companyName: string;
    savedAt: string;
  }[];
};

export type DashboardApplications = {
  /** Includes completed processes; used only to distinguish first run. */
  totalCount: number;
  activeCount: number;
  /** Scheduled actions on live applications, soonest first. */
  upcomingActions: DashboardDeadline[];
  /** Scheduled actions already past their date, including any beyond the list. */
  overdueActionCount: number;
  /** Live applications untouched long enough to have moved off-platform. */
  stalledApplicationCount: number;
  /** Live counts by stage, in funnel order. Stages at zero are omitted. */
  pipeline: DashboardPipelineEntry[];
  active: {
    jobSlug: string;
    title: string;
    companyName: string;
    status: string;
    updatedAt: string;
    /** Set when this record has not moved for `STALE_APPLICATION_MS`. */
    stalled: boolean;
    deadline: Deadline | null;
  }[];
};

export type DashboardAlerts = {
  /** Includes paused alerts; used only to distinguish first run. */
  totalCount: number;
  activeCount: number;
};

export type DashboardProfile = {
  exists: boolean;
  headline: string | null;
  attestedAt: string | null;
  /** Completed share of the fields that drive job matching, 0-1. */
  completeness: number;
  /** Which of those fields are still unstated. */
  missingFields: string[];
};

export type DashboardSummary = {
  /**
   * The weakest state across the four reads. One degraded section degrades the
   * dashboard, so a partial view is never presented as complete.
   */
  state: RepositoryReadState;
  savedJobs: DashboardSection<DashboardSavedJobs>;
  applications: DashboardSection<DashboardApplications>;
  alerts: DashboardSection<DashboardAlerts>;
  profile: DashboardSection<DashboardProfile>;
  /**
   * True only when the reads succeeded and found no career records or profile.
   * A failed read also reports zero of everything, and greeting that as a
   * fresh start would present missing data as an empty account.
   */
  isFirstRun: boolean;
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

function sectionUnavailable<T>(
  state: Exclude<RepositoryReadState, "ready">,
): DashboardSection<T> {
  return { state, data: null };
}

/**
 * Reads every private career surface the dashboard summarises.
 *
 * The four reads run concurrently because none depends on another, and a
 * dashboard that serialised them would pay four round trips before first paint.
 *
 * `now` is a parameter so the time-dependent readings — what is overdue, what
 * has stalled — can be pinned in tests.
 */
export async function getDashboardSummary(
  now: number = Date.now(),
): Promise<DashboardSummary> {
  const [saved, applications, alerts, profile] = await Promise.all([
    getSavedJobs(),
    getApplications(),
    getAlerts(),
    getCandidateProfile(),
  ]);

  const activeApplications =
    applications.state === "ready"
      ? applications.data.filter((application) =>
          isActiveApplicationStatus(application.status),
        )
      : [];

  // Ordered on parsed instants rather than on the raw strings: stored
  // timestamps may carry different UTC offsets, and a lexical compare would
  // then place a later action ahead of the soonest one.
  const scheduled = activeApplications
    .flatMap((application) => {
      if (!application.next_action_at) return [];
      const deadline = readDeadline(application.next_action_at, now);
      if (!deadline) return [];
      return [
        {
          ...deadline,
          jobSlug: application.job_slug,
          title: application.title,
          companyName: application.company_name,
          dueAt: application.next_action_at,
        },
      ];
    })
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));

  const state = weakestState([
    saved.state,
    applications.state,
    alerts.state,
    profile.state,
  ]);
  const profileRow = profile.state === "ready" ? profile.data : null;
  const missingFields =
    profile.state === "ready" ? missingMatchingFields(profileRow) : [];

  const savedJobsSection: DashboardSection<DashboardSavedJobs> =
    saved.state === "ready"
      ? {
          state: "ready",
          data: {
            count: saved.data.length,
            recent: saved.data.slice(0, MAX_LISTED_RECORDS).map((job) => ({
              jobSlug: job.job_slug,
              title: job.title,
              companyName: job.company_name,
              savedAt: job.saved_at,
            })),
          },
        }
      : sectionUnavailable(saved.state);

  const applicationsSection: DashboardSection<DashboardApplications> =
    applications.state === "ready"
      ? {
          state: "ready",
          data: {
            totalCount: applications.data.length,
            activeCount: activeApplications.length,
            upcomingActions: scheduled.slice(0, MAX_LISTED_ACTIONS),
            overdueActionCount: scheduled.filter(
              (action) => action.urgency === "overdue",
            ).length,
            stalledApplicationCount: activeApplications.filter((application) =>
              isStaleApplication(application.updated_at, now),
            ).length,
            pipeline: ACTIVE_APPLICATION_STATUSES.map((status) => ({
              status,
              count: activeApplications.filter(
                (application) => application.status === status,
              ).length,
            })).filter((entry) => entry.count > 0),
            active: activeApplications
              .slice(0, MAX_LISTED_RECORDS)
              .map((application) => ({
                jobSlug: application.job_slug,
                title: application.title,
                companyName: application.company_name,
                status: application.status,
                updatedAt: application.updated_at,
                stalled: isStaleApplication(application.updated_at, now),
                deadline: application.next_action_at
                  ? readDeadline(application.next_action_at, now)
                  : null,
              })),
          },
        }
      : sectionUnavailable(applications.state);

  const alertsSection: DashboardSection<DashboardAlerts> =
    alerts.state === "ready"
      ? {
          state: "ready",
          data: {
            totalCount: alerts.data.length,
            activeCount: alerts.data.filter((alert) => alert.active).length,
          },
        }
      : sectionUnavailable(alerts.state);

  const profileSection: DashboardSection<DashboardProfile> =
    profile.state === "ready"
      ? {
          state: "ready",
          data: {
            exists: profileRow !== null,
            headline: profileRow?.headline ?? null,
            attestedAt: profileRow?.attested_at ?? null,
            completeness:
              (MATCHING_FIELD_COUNT - missingFields.length) /
              MATCHING_FIELD_COUNT,
            missingFields,
          },
        }
      : sectionUnavailable(profile.state);

  return {
    state,
    savedJobs: savedJobsSection,
    applications: applicationsSection,
    alerts: alertsSection,
    profile: profileSection,
    isFirstRun:
      state === "ready" &&
      saved.data.length === 0 &&
      applications.data.length === 0 &&
      alerts.data.length === 0 &&
      profileRow === null,
  };
}
