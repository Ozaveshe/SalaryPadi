import "server-only";

import { unstable_rethrow } from "next/navigation";

export type RepositoryOperationAttempt<T> =
  { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Captures ordinary transport/client failures at a repository boundary while
 * preserving framework-controlled Next.js errors such as dynamic-render and
 * navigation signals.
 */
export async function attemptRepositoryOperation<T>(
  operation: () => T | PromiseLike<T>,
): Promise<RepositoryOperationAttempt<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error };
  }
}
