import { describe, expect, it, vi } from "vitest";

// @ts-expect-error The production verifier is a native ESM script without declarations.
import { verifyGitHubActionsStatus } from "../../../scripts/verify-deploy-channel.mjs";

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function logger() {
  return { log: vi.fn(), warn: vi.fn() };
}

describe("GitHub Actions deploy status verification", () => {
  it("skips with a warning when the optional token is absent", async () => {
    const output = logger();
    const result = await verifyGitHubActionsStatus({
      repository: "Ozaveshe/SalaryPadi",
      commit: "abc123",
      logger: output,
    });

    expect(result).toEqual({ outcome: "skipped", reason: "missing_token" });
    expect(output.warn).toHaveBeenCalledWith(
      expect.stringContaining("GITHUB_STATUS_TOKEN"),
    );
  });

  it("fails closed when the latest matching CI run failed", async () => {
    const result = await verifyGitHubActionsStatus({
      token: "test-token",
      repository: "Ozaveshe/SalaryPadi",
      commit: "abc123",
      branch: "main",
      logger: logger(),
      fetchImpl: vi.fn(async () =>
        response({
          workflow_runs: [
            {
              id: 42,
              name: "CI",
              head_sha: "abc123",
              head_branch: "main",
              status: "completed",
              conclusion: "failure",
              updated_at: "2026-07-13T12:00:00Z",
              html_url:
                "https://github.com/Ozaveshe/SalaryPadi/actions/runs/42",
            },
          ],
        }),
      ),
    });

    expect(result).toMatchObject({ outcome: "failed", reason: "ci_failed" });
  });

  it("accepts a successful latest matching CI run", async () => {
    const output = logger();
    const result = await verifyGitHubActionsStatus({
      token: "test-token",
      repository: "Ozaveshe/SalaryPadi",
      commit: "abc123",
      branch: "main",
      logger: output,
      fetchImpl: vi.fn(async () =>
        response({
          workflow_runs: [
            {
              id: 43,
              name: "CI",
              head_sha: "abc123",
              head_branch: "main",
              status: "completed",
              conclusion: "success",
              updated_at: "2026-07-13T12:01:00Z",
            },
          ],
        }),
      ),
    });

    expect(result).toEqual({ outcome: "passed", reason: "ci_succeeded" });
    expect(output.log).toHaveBeenCalledWith(
      expect.stringContaining("GitHub CI verified"),
    );
  });

  it("fails open with a warning when the GitHub API is unavailable", async () => {
    const output = logger();
    const result = await verifyGitHubActionsStatus({
      token: "test-token",
      repository: "Ozaveshe/SalaryPadi",
      commit: "abc123",
      logger: output,
      fetchImpl: vi.fn(async () => {
        throw new Error("network unavailable");
      }),
    });

    expect(result).toEqual({
      outcome: "skipped",
      reason: "api_unavailable",
    });
    expect(output.warn).toHaveBeenCalledWith(
      expect.stringContaining("fail-open"),
    );
  });
});
