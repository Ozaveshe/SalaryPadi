export type LifecycleState = "open" | "checking" | "closed";
export type SourceRunOutcome =
  "complete" | "partial" | "failed" | "timed_out" | "http_403" | "http_429";

export interface LifecycleEvidence {
  state: LifecycleState;
  successfulAbsenceCount: number;
  firstSuccessfulAbsenceAt: string | null;
  lastSuccessfulAbsenceAt: string | null;
  validThrough: string | null;
  sourceType: "automated" | "manual";
  lastConfirmedAt: string;
}

export type LifecycleEvent =
  | { type: "seen"; at: string }
  | { type: "absent"; at: string; outcome: SourceRunOutcome }
  | { type: "confirmed_closed"; at: string }
  | { type: "maintenance"; at: string };

export interface LifecycleDecision extends LifecycleEvidence {
  changed: boolean;
  reason:
    | "seen"
    | "first_successful_absence"
    | "absence_waiting_for_30_minutes"
    | "second_successful_absence"
    | "confirmed_source_closure"
    | "deadline_elapsed"
    | "manual_reconfirmation_overdue"
    | "non_authoritative_run"
    | "stale_event"
    | "no_change";
}

const THIRTY_MINUTES_MS = 30 * 60_000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60_000;

function parsed(value: string) {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new Error("invalid_lifecycle_timestamp");
  return result;
}

function latestObservedEvidenceAt(current: LifecycleEvidence) {
  return Math.max(
    parsed(current.lastConfirmedAt),
    current.firstSuccessfulAbsenceAt
      ? parsed(current.firstSuccessfulAbsenceAt)
      : Number.NEGATIVE_INFINITY,
    current.lastSuccessfulAbsenceAt
      ? parsed(current.lastSuccessfulAbsenceAt)
      : Number.NEGATIVE_INFINITY,
  );
}

function result(
  current: LifecycleEvidence,
  patch: Partial<LifecycleEvidence>,
  reason: LifecycleDecision["reason"],
): LifecycleDecision {
  const next = { ...current, ...patch };
  return {
    ...next,
    changed: JSON.stringify(next) !== JSON.stringify(current),
    reason,
  };
}

export function reconcileLifecycle(
  current: LifecycleEvidence,
  event: LifecycleEvent,
): LifecycleDecision {
  const eventAt = parsed(event.at);
  if (current.state === "closed") return result(current, {}, "no_change");
  if (eventAt < latestObservedEvidenceAt(current)) {
    return result(current, {}, "stale_event");
  }

  if (event.type === "confirmed_closed") {
    return result(current, { state: "closed" }, "confirmed_source_closure");
  }
  if (event.type === "seen") {
    return result(
      current,
      {
        state: "open",
        successfulAbsenceCount: 0,
        firstSuccessfulAbsenceAt: null,
        lastSuccessfulAbsenceAt: null,
        lastConfirmedAt: event.at,
      },
      "seen",
    );
  }
  if (event.type === "absent") {
    if (event.outcome !== "complete") {
      return result(current, {}, "non_authoritative_run");
    }
    if (!current.firstSuccessfulAbsenceAt) {
      return result(
        current,
        {
          state: "checking",
          successfulAbsenceCount: 1,
          firstSuccessfulAbsenceAt: event.at,
          lastSuccessfulAbsenceAt: event.at,
        },
        "first_successful_absence",
      );
    }
    if (
      eventAt - parsed(current.firstSuccessfulAbsenceAt) <
      THIRTY_MINUTES_MS
    ) {
      return result(
        current,
        {
          state: "checking",
          successfulAbsenceCount: 1,
          lastSuccessfulAbsenceAt: event.at,
        },
        "absence_waiting_for_30_minutes",
      );
    }
    return result(
      current,
      {
        state: "closed",
        successfulAbsenceCount: Math.max(2, current.successfulAbsenceCount + 1),
        lastSuccessfulAbsenceAt: event.at,
      },
      "second_successful_absence",
    );
  }

  if (current.validThrough && parsed(current.validThrough) <= eventAt) {
    return result(current, { state: "closed" }, "deadline_elapsed");
  }
  if (
    current.sourceType === "manual" &&
    !current.validThrough &&
    eventAt - parsed(current.lastConfirmedAt) >= THIRTY_DAYS_MS
  ) {
    return result(
      current,
      { state: "closed" },
      "manual_reconfirmation_overdue",
    );
  }
  return result(current, {}, "no_change");
}
