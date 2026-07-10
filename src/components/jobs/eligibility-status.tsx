import { CircleAlert, CircleCheck, CircleHelp } from "lucide-react";

import type { JobEligibility } from "@/lib/jobs/types";

export function EligibilityStatus({
  eligibility,
  compact = false,
}: {
  eligibility: JobEligibility;
  compact?: boolean;
}) {
  if (eligibility.nigeria === "eligible") {
    return (
      <span className="status status-success">
        <CircleCheck aria-hidden="true" size={14} strokeWidth={2.5} />
        {compact ? "Nigeria eligible" : "Eligible from Nigeria"}
      </span>
    );
  }

  if (eligibility.nigeria === "not_eligible") {
    return (
      <span className="status status-danger">
        <CircleAlert aria-hidden="true" size={14} strokeWidth={2.5} />
        Nigeria not listed
      </span>
    );
  }

  return (
    <span className="status status-warning">
      <CircleHelp aria-hidden="true" size={14} strokeWidth={2.5} />
      Eligibility unclear
    </span>
  );
}
