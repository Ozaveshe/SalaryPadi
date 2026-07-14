import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FAILED_GITHUB_CONCLUSIONS = new Set([
  "action_required",
  "cancelled",
  "failure",
  "stale",
  "startup_failure",
  "timed_out",
]);
const GITHUB_STATUS_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

async function readBoundedJson(response, maximumBytes) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isSafeInteger(declaredLength) && declaredLength > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("response exceeds the byte limit");
  }
  if (!response.body) throw new Error("response body is unavailable");

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("response exceeds the byte limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function normalizeRepository(rawUrl) {
  return rawUrl
    ?.trim()
    .replace(/^git@github\.com:/u, "https://github.com/")
    .replace(/\.git$/u, "")
    .replace(/\/$/u, "");
}

function githubRepositorySlug(repositoryUrl) {
  try {
    const parsed = new URL(repositoryUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parsed.hostname !== "github.com" || parts.length !== 2)
      return undefined;
    return parts.join("/");
  } catch {
    return undefined;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function skippedGitHubStatus(logger, reason, message) {
  logger.warn(`GitHub CI status check skipped: ${message} (fail-open).`);
  return { outcome: "skipped", reason };
}

export async function verifyGitHubActionsStatus({
  token,
  repository,
  commit,
  branch,
  workflowName = "CI",
  apiBaseUrl = "https://api.github.com",
  fetchImpl = fetch,
  logger = console,
}) {
  if (!token) {
    return skippedGitHubStatus(
      logger,
      "missing_token",
      "GITHUB_STATUS_TOKEN is not configured",
    );
  }
  if (!repository || !commit) {
    return skippedGitHubStatus(
      logger,
      "missing_identity",
      "repository or commit identity is unavailable",
    );
  }

  let endpoint;
  try {
    const apiBase = new URL(apiBaseUrl);
    if (apiBase.protocol !== "https:" || apiBase.username || apiBase.password) {
      throw new Error("GitHub API base must be credential-free HTTPS");
    }
    endpoint = new URL(`/repos/${repository}/actions/runs`, apiBase);
  } catch (error) {
    return skippedGitHubStatus(
      logger,
      "invalid_endpoint",
      `GitHub API endpoint is invalid: ${errorMessage(error)}`,
    );
  }
  endpoint.searchParams.set("head_sha", commit);
  endpoint.searchParams.set("per_page", "100");

  let response;
  try {
    response = await fetchImpl(endpoint, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "SalaryPadi-deploy-verifier",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    return skippedGitHubStatus(
      logger,
      "api_unavailable",
      `GitHub API unavailable: ${errorMessage(error)}`,
    );
  }

  if (!response.ok) {
    return skippedGitHubStatus(
      logger,
      "api_unavailable",
      `GitHub API returned HTTP ${response.status}`,
    );
  }

  let payload;
  try {
    payload = await readBoundedJson(response, GITHUB_STATUS_MAX_RESPONSE_BYTES);
  } catch (error) {
    return skippedGitHubStatus(
      logger,
      "api_unavailable",
      `GitHub API returned invalid JSON: ${errorMessage(error)}`,
    );
  }

  if (!Array.isArray(payload?.workflow_runs)) {
    return skippedGitHubStatus(
      logger,
      "api_unavailable",
      "GitHub API response omitted workflow_runs",
    );
  }

  const matchingRuns = payload.workflow_runs.filter(
    (run) => run?.name === workflowName && run?.head_sha === commit,
  );
  const branchRuns = branch
    ? matchingRuns.filter((run) => run?.head_branch === branch)
    : [];
  const candidates = branchRuns.length > 0 ? branchRuns : matchingRuns;
  const latestRun = candidates.toSorted((left, right) => {
    const leftTime = Date.parse(
      left?.updated_at ?? left?.run_started_at ?? left?.created_at ?? "",
    );
    const rightTime = Date.parse(
      right?.updated_at ?? right?.run_started_at ?? right?.created_at ?? "",
    );
    return (
      (Number.isNaN(rightTime) ? 0 : rightTime) -
      (Number.isNaN(leftTime) ? 0 : leftTime)
    );
  })[0];

  if (!latestRun) {
    return skippedGitHubStatus(
      logger,
      "run_unavailable",
      `${workflowName} has no run for commit ${commit}`,
    );
  }

  const conclusion = latestRun.conclusion ?? undefined;
  const runReference = latestRun.html_url ?? `run ${latestRun.id ?? "unknown"}`;
  if (conclusion && FAILED_GITHUB_CONCLUSIONS.has(conclusion)) {
    return {
      outcome: "failed",
      reason: "ci_failed",
      message: `GitHub Actions ${workflowName} concluded ${conclusion} for commit ${commit} (${runReference})`,
    };
  }

  if (latestRun.status === "completed" && conclusion === "success") {
    logger.log(
      `GitHub CI verified: workflow=${workflowName} commit=${commit} run=${runReference}`,
    );
    return { outcome: "passed", reason: "ci_succeeded" };
  }

  return skippedGitHubStatus(
    logger,
    "run_incomplete",
    `${workflowName} for commit ${commit} is ${latestRun.status ?? "unknown"}/${conclusion ?? "pending"}`,
  );
}

function localEnvValue(root, name) {
  for (const filename of [".env.production.local", ".env.local", ".env"]) {
    try {
      const contents = readFileSync(resolve(root, filename), "utf8");
      const line = contents
        .split(/\r?\n/u)
        .find((entry) => entry.startsWith(`${name}=`));
      if (line) return line.slice(name.length + 1).trim();
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return undefined;
}

function localSiteId(root) {
  try {
    return JSON.parse(
      readFileSync(resolve(root, ".netlify/state.json"), "utf8"),
    ).siteId;
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

export function formatDeployChannelSummary({
  channel,
  branch,
  context,
  githubStatus,
}) {
  return [
    `Deploy channel configuration verified: ${channel.product}`,
    `site=${channel.netlifySiteId}`,
    `domain=${channel.productionUrl}`,
    `supabase=${channel.supabaseProjectRef}`,
    `branch=${branch}`,
    `context=${context}`,
    `github_ci=${githubStatus.outcome}:${githubStatus.reason}`,
  ].join(" ");
}

async function main() {
  const root = process.cwd();
  const channel = JSON.parse(
    readFileSync(resolve(root, "deploy/channel.json"), "utf8"),
  );
  const packageJson = JSON.parse(
    readFileSync(resolve(root, "package.json"), "utf8"),
  );
  const context = process.env.CONTEXT ?? "local";
  const production =
    context === "production" || process.argv.includes("--production");
  const siteId =
    process.env.SITE_ID ?? process.env.NETLIFY_SITE_ID ?? localSiteId(root);
  const productionUrl =
    process.env.URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    localEnvValue(root, "NEXT_PUBLIC_APP_URL");
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    localEnvValue(root, "NEXT_PUBLIC_SUPABASE_URL");
  const branch = process.env.BRANCH ?? git(root, "branch", "--show-current");
  const repository = normalizeRepository(
    process.env.REPOSITORY_URL ?? git(root, "remote", "get-url", "origin"),
  );

  const failures = [];
  function assertEqual(label, actual, expected) {
    if (actual !== expected) {
      failures.push(
        `${label} mismatch: expected ${expected}, received ${actual ?? "missing"}`,
      );
    }
  }

  assertEqual("product package", packageJson.name, channel.packageName);
  assertEqual("Netlify site", siteId, channel.netlifySiteId);
  if (production || context !== "local") {
    assertEqual("production URL", productionUrl, channel.productionUrl);
  }
  assertEqual("Supabase project", supabaseUrl, channel.supabaseUrl);
  assertEqual(
    "Git repository",
    repository,
    normalizeRepository(channel.gitRepository),
  );
  if (production) {
    assertEqual("production branch", branch, channel.releaseBranch);
  }

  if (failures.length > 0) {
    console.error(
      `SalaryPadi deploy channel verification failed:\n- ${failures.join("\n- ")}`,
    );
    process.exitCode = 1;
    return;
  }

  const githubStatus = await verifyGitHubActionsStatus({
    token: process.env.GITHUB_STATUS_TOKEN?.trim(),
    repository: githubRepositorySlug(repository),
    commit: process.env.COMMIT_REF?.trim() || git(root, "rev-parse", "HEAD"),
    branch,
    apiBaseUrl: process.env.GITHUB_API_URL ?? "https://api.github.com",
  });
  if (githubStatus.outcome === "failed") {
    console.error(
      `SalaryPadi deploy channel verification failed:\n- ${githubStatus.message}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    formatDeployChannelSummary({ channel, branch, context, githubStatus }),
  );
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]).toLowerCase() ===
    fileURLToPath(import.meta.url).toLowerCase();
if (invokedDirectly) await main();
