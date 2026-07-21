import "server-only";

import { z } from "zod";

import { repositoryIssue } from "@/lib/data/repository-result";

export const apiRpcBooleanResultSchema = z.boolean();
export const apiRpcUuidResultSchema = z.string().uuid();
export const apiRpcVoidResultSchema = z.null();
export const apiRpcTimestampResultSchema = z
  .string()
  .datetime({ offset: true });

export type ApiRpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "query_failed" | "invalid_result" };

/**
 * Decodes the runtime RPC payload before a route can report a mutation as
 * successful. Supabase query failures and malformed success payloads remain
 * distinct in safe operational logs.
 */
export function decodeApiRpcResult<T>(
  operation: string,
  errorCode: string,
  result: { data: unknown; error: unknown },
  schema: z.ZodType<T>,
): ApiRpcResult<T> {
  if (result.error) {
    repositoryIssue(operation, "query_failed", errorCode, result.error);
    return { ok: false, kind: "query_failed" };
  }

  const parsed = schema.safeParse(result.data);
  if (!parsed.success) {
    repositoryIssue(operation, "invalid_rows", `${errorCode}_invalid_result`);
    return { ok: false, kind: "invalid_result" };
  }
  return { ok: true, data: parsed.data };
}
