import type { RepositoryResult } from "@/lib/data/repository-result";

export function RepositoryNotice({
  result,
  resource,
}: {
  result: RepositoryResult<unknown>;
  resource: string;
}) {
  if (result.state === "ready") return null;

  const unconfigured = result.state === "unconfigured";
  const degraded = result.state === "degraded";
  return (
    <div className="notice notice-warning" role="status">
      <strong>
        {unconfigured
          ? "Backend connection needed."
          : degraded
            ? `${resource} are partially available.`
            : `${resource} could not be loaded.`}
      </strong>{" "}
      {unconfigured
        ? "This environment is not connected to the dedicated SalaryPadi backend."
        : degraded
          ? "Some sources failed validation or could not be reached. Available records are shown with no invented replacements."
          : "This is a data-read problem, not confirmation that no records exist. Try again later."}
    </div>
  );
}

export function CombinedRepositoryNotice({
  results,
  resource,
}: {
  results: readonly RepositoryResult<unknown>[];
  resource: string;
}) {
  const affected = results.filter((result) => result.state !== "ready");
  if (affected.length === 0) return null;

  const state = results.some(
    (result) => result.state === "ready" || result.state === "degraded",
  )
    ? "degraded"
    : affected.every((result) => result.state === "unconfigured")
      ? "unconfigured"
      : "unavailable";
  return (
    <RepositoryNotice
      resource={resource}
      result={{
        state,
        data: null,
        issues: affected.flatMap((result) => result.issues),
      }}
    />
  );
}
