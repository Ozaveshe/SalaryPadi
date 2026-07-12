export function PrivateDataStatus({
  state,
}: {
  state: "degraded" | "unconfigured" | "unavailable" | "invalid";
}) {
  return (
    <div className="notice notice-danger" role="alert">
      <strong>Private data could not be loaded.</strong>{" "}
      {state === "unconfigured"
        ? "The account backend is not configured in this environment."
        : "Your records have not been changed or lost. Please reload and try again; if this continues, contact support."}
    </div>
  );
}
