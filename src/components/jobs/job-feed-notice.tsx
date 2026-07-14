import type { JobFeedResult } from "@/lib/jobs/types";

export function JobFeedNotice({ feed }: { feed: JobFeedResult }) {
  if (feed.state === "live") return null;

  const heading =
    feed.state === "degraded"
      ? "Job results are partially available."
      : feed.state === "disabled"
        ? "Live job results are not configured."
        : "Live job results could not be loaded.";
  const detail =
    feed.message ??
    (feed.state === "degraded"
      ? "Some reviewed sources could not be checked. Available records are shown without invented replacements."
      : "This source state is not confirmation that no matching job exists. Try again later.");

  return (
    <div className="notice notice-warning" role="status">
      <strong>{heading}</strong> {detail}
    </div>
  );
}
