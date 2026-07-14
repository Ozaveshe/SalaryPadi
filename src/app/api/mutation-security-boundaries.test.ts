import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const apiRoot = join(process.cwd(), "src", "app", "api");
const mutationDeclaration =
  /export\s+(?:(?:async\s+)?function|const)\s+(POST|PUT|PATCH|DELETE)\b/g;
const mutationExport =
  /export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{/g;
const guardCalls = [
  "rejectCrossOriginRequest(request)",
  "isValidInternalBearer(request,",
] as const;
const requestConsumers = [
  "getAuthenticatedApiContext(",
  "request.formData(",
  "request.json(",
  "parseBoundedJsonBody(",
  "readApiForm(",
  "readBoundedJson(",
] as const;
const boundedBodyReaders = ["readApiForm(", "readBoundedJson("] as const;
const reviewedBodylessMutations = new Set([
  "src/app/api/auth/sign-out/route.ts:POST",
  "src/app/api/contributions/drafts/route.ts:DELETE",
  "src/app/api/internal/job-source-snapshot/route.ts:POST",
  "src/app/api/saved/route.ts:DELETE",
]);

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? routeFiles(path)
      : entry.name === "route.ts"
        ? [path]
        : [];
  });
}

function mutationBodies(source: string) {
  const matches = [...source.matchAll(mutationExport)];
  return matches.map((match, index) => ({
    method: match[1]!,
    body: source.slice(
      match.index!,
      matches[index + 1]?.index ?? source.length,
    ),
  }));
}

describe("API mutation security boundaries", () => {
  it("guards every mutation before authentication or request-body parsing", () => {
    let declaredMutationCount = 0;
    const mutations = routeFiles(apiRoot).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      declaredMutationCount += [...source.matchAll(mutationDeclaration)].length;
      return mutationBodies(source).map(({ method, body }) => ({
        file,
        method,
        body,
      }));
    });

    expect(mutations.length).toBeGreaterThan(0);
    expect(
      mutations.length,
      "The mutation scanner missed an exported route handler; update it before relying on these invariants.",
    ).toBe(declaredMutationCount);
    for (const mutation of mutations) {
      const guardIndexes = guardCalls
        .map((guard) => mutation.body.indexOf(guard))
        .filter((index) => index >= 0);
      expect(
        guardIndexes,
        `${mutation.method} ${mutation.file} lacks a same-origin or internal bearer guard`,
      ).not.toHaveLength(0);

      const firstGuard = Math.min(...guardIndexes);
      const consumerIndexes = requestConsumers
        .map((consumer) => mutation.body.indexOf(consumer))
        .filter((index) => index >= 0);
      if (consumerIndexes.length > 0) {
        expect(
          firstGuard,
          `${mutation.method} ${mutation.file} processes identity or input before its request guard`,
        ).toBeLessThan(Math.min(...consumerIndexes));
      }
    }
  });

  it("bounds every mutation body unless the operation is explicitly bodyless", () => {
    const mutations = routeFiles(apiRoot).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return mutationBodies(source).map(({ method, body }) => ({
        key: `${file.replaceAll("\\", "/").replace(`${process.cwd().replaceAll("\\", "/")}/`, "")}:${method}`,
        body,
      }));
    });

    for (const mutation of mutations) {
      const bounded = boundedBodyReaders.some((reader) =>
        mutation.body.includes(reader),
      );
      expect(
        bounded || reviewedBodylessMutations.has(mutation.key),
        `${mutation.key} must use a bounded body reader or be reviewed as bodyless`,
      ).toBe(true);
    }
  });

  it("validates every mutation RPC acknowledgement before reporting success", () => {
    const rpcMutations = routeFiles(apiRoot).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return mutationBodies(source)
        .filter(({ body }) => body.includes(".rpc("))
        .map(({ method, body }) => ({ file, method, body }));
    });

    expect(rpcMutations.length).toBeGreaterThan(0);
    for (const mutation of rpcMutations) {
      expect(
        mutation.body.includes("decodeApiRpcResult("),
        `${mutation.method} ${mutation.file} must validate its RPC result envelope and data`,
      ).toBe(true);
    }
  });
});
