export type RepositoryReadState =
  "ready" | "degraded" | "unconfigured" | "unavailable" | "invalid";

export type RepositoryIssueKind =
  | "not_configured"
  | "query_failed"
  | "invalid_container"
  | "invalid_rows"
  | "upstream_unavailable";

export interface RepositoryIssue {
  operation: string;
  kind: RepositoryIssueKind;
  /** Stable machine-readable identifier suitable for logs and tests. */
  code: string;
}

export interface RepositoryResult<T> {
  state: RepositoryReadState;
  data: T;
  issues: RepositoryIssue[];
}

function failureDetails(reason: unknown): Record<string, string> | undefined {
  if (reason instanceof Error) {
    return { errorName: reason.name };
  }
  if (
    typeof reason === "object" &&
    reason !== null &&
    "code" in reason &&
    typeof reason.code === "string" &&
    /^[A-Za-z0-9_.-]{1,80}$/.test(reason.code)
  ) {
    return { providerCode: reason.code };
  }
  return undefined;
}

/**
 * Records a server-side repository failure without returning provider details
 * to the rendered page. The stable issue is safe to use for UI state and tests.
 */
export function repositoryIssue(
  operation: string,
  kind: RepositoryIssueKind,
  code: string,
  reason?: unknown,
): RepositoryIssue {
  const issue = { operation, kind, code } satisfies RepositoryIssue;
  if (kind !== "not_configured") {
    console.error(
      JSON.stringify({
        event: "repository.read_failed",
        ...issue,
        ...(failureDetails(reason) ?? {}),
      }),
    );
  }
  return issue;
}

export function repositoryReady<T>(data: T): RepositoryResult<T> {
  return { state: "ready", data, issues: [] };
}

export function repositoryFailure<T>(
  state: Exclude<RepositoryReadState, "ready" | "degraded">,
  data: T,
  issue: RepositoryIssue,
): RepositoryResult<T> {
  return { state, data, issues: [issue] };
}

export function repositoryDegraded<T>(
  data: T,
  issues: RepositoryIssue[],
): RepositoryResult<T> {
  return issues.length === 0
    ? repositoryReady(data)
    : { state: "degraded", data, issues };
}

export function mapRepositoryResult<Input, Output>(
  result: RepositoryResult<Input>,
  map: (data: Input) => Output,
): RepositoryResult<Output> {
  return { ...result, data: map(result.data) };
}
