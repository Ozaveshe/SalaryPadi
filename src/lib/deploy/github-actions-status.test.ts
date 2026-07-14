import { describe, expect, it, vi } from "vitest";

const { formatDeployChannelSummary, verifyGitHubActionsStatus } = await import(
  // @ts-expect-error The production verifier is a native ESM script without declarations.
  "../../../scripts/verify-deploy-channel.mjs"
);

function response(payload: unknown, status = 200) {
  return Response.json(payload, { status });
}

function logger() {
  return { log: vi.fn(), warn: vi.fn() };
}

describe("GitHub Actions deploy status verification", () => {
  it("keeps configuration proof separate from skipped CI proof", () => {
    expect(
      formatDeployChannelSummary({
        channel: {
          product: "SalaryPadi",
          netlifySiteId: "site-id",
          productionUrl: "https://salarypadi.com",
          supabaseProjectRef: "bxelrhklsznmpksgrqep",
        },
        branch: "main",
        context: "production",
        githubStatus: { outcome: "skipped", reason: "missing_token" },
      }),
    ).toContain("github_ci=skipped:missing_token");
  });

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
    const fetchImpl = vi.fn(
      async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        void input;
        void init;
        return response({
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
        });
      },
    );
    const result = await verifyGitHubActionsStatus({
      token: "test-token",
      repository: "Ozaveshe/SalaryPadi",
      commit: "abc123",
      branch: "main",
      logger: output,
      fetchImpl,
    });

    expect(result).toEqual({ outcome: "passed", reason: "ci_succeeded" });
    expect(output.log).toHaveBeenCalledWith(
      expect.stringContaining("GitHub CI verified"),
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
  });

  it("does not send a status token to a non-HTTPS API endpoint", async () => {
    const fetchImpl = vi.fn();

    const result = await verifyGitHubActionsStatus({
      token: "test-token",
      repository: "Ozaveshe/SalaryPadi",
      commit: "abc123",
      apiBaseUrl: "http://github.example.test",
      logger: logger(),
      fetchImpl,
    });

    expect(result).toEqual({ outcome: "skipped", reason: "invalid_endpoint" });
    expect(fetchImpl).not.toHaveBeenCalled();
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
