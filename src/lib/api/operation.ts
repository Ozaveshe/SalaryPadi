import "server-only";

import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import { repositoryIssue } from "@/lib/data/repository-result";
import { noStoreResponse } from "@/lib/http/json";

export type ApiOperationResult<T> =
  { ok: true; value: T } | { ok: false; response: Response };

export async function attemptApiOperation<T>(
  operation: string,
  errorCode: string,
  publicMessage: string,
  run: () => PromiseLike<T> | T,
): Promise<ApiOperationResult<T>> {
  const attempt = await attemptRepositoryOperation(run);
  if (attempt.ok) return attempt;

  repositoryIssue(operation, "query_failed", errorCode, attempt.error);
  return {
    ok: false,
    response: noStoreResponse(
      Response.json({ error: publicMessage }, { status: 503 }),
    ),
  };
}
