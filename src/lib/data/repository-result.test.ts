import { describe, expect, it, vi } from "vitest";

import {
  mapRepositoryResult,
  repositoryDegraded,
  repositoryFailure,
  repositoryIssue,
  repositoryReady,
} from "./repository-result";

describe("repository result contract", () => {
  it("keeps a successful empty read distinct from a failure", () => {
    expect(repositoryReady([])).toEqual({
      state: "ready",
      data: [],
      issues: [],
    });
    const issue = repositoryIssue(
      "salary.search",
      "not_configured",
      "salary_backend_unconfigured",
    );
    expect(repositoryFailure("unconfigured", [], issue)).toEqual({
      state: "unconfigured",
      data: [],
      issues: [issue],
    });
  });

  it("records stable failures without exposing arbitrary reason fields", () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const issue = repositoryIssue(
      "privacy.list",
      "query_failed",
      "privacy_query_failed",
      { message: "database unavailable", secret: "do not log" },
    );

    expect(issue).toEqual({
      operation: "privacy.list",
      kind: "query_failed",
      code: "privacy_query_failed",
    });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('"code":"privacy_query_failed"'),
    );
    expect(error).not.toHaveBeenCalledWith(expect.stringContaining("secret"));
    expect(error).not.toHaveBeenCalledWith(
      expect.stringContaining("database unavailable"),
    );
  });

  it("preserves issues while mapping partial data", () => {
    const issue = repositoryIssue(
      "companies.list",
      "not_configured",
      "companies_backend_unconfigured",
    );
    const result = repositoryDegraded([1, 2], [issue]);

    expect(mapRepositoryResult(result, (values) => values.length)).toEqual({
      state: "degraded",
      data: 2,
      issues: [issue],
    });
  });
});
