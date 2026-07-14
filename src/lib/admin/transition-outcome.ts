export type AdminTransitionNotice = {
  className: string;
  detail: string;
  heading: string;
  role: "alert" | "status";
};

export function getAdminTransitionNotice(
  outcome: string | null,
): AdminTransitionNotice | null {
  if (outcome === "true") {
    return {
      className: "notice",
      detail: "The queue has been refreshed from the connected backend.",
      heading: "Transition completed.",
      role: "status",
    };
  }

  if (outcome === "degraded") {
    return {
      className: "notice notice-warning",
      detail:
        "The write completed, but cache propagation could not be confirmed. Do not submit the transition again; verify source propagation before taking another action.",
      heading: "Transition completed with incomplete propagation.",
      role: "status",
    };
  }

  if (outcome === "error") {
    return {
      className: "notice notice-warning",
      detail:
        "The requested state change was not applied. Review the row and resolve the backend error before trying again.",
      heading: "Transition failed.",
      role: "alert",
    };
  }

  return null;
}
