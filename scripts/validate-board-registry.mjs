// Employer board registry tooling.
//
//   node scripts/validate-board-registry.mjs --check
//     Structural validation only (no network): schema, unique identifiers,
//     status vocabulary, evidence rules. Safe for CI.
//
//   node scripts/validate-board-registry.mjs --probe [N]
//     Probes up to N (default 5) candidate/probed_zero boards against the
//     providers' documented public board APIs, one request per board with
//     2s spacing, and updates lastProbedAt/lastProbeOpenRoles/status in the
//     registry file. Probing NEVER registers a source: registration remains
//     the manual Moniepoint-recipe rights review.
//
// Discovery guardrails: only documented public ATS board APIs are probed
// (Greenhouse boards-api, Lever postings, Ashby posting-api, Workable
// widget). No login, no CAPTCHA, no HTML scraping, no identity rotation.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const REGISTRY_PATH = resolve(
  process.cwd(),
  "config/employer-board-registry.json",
);
const STATUSES = new Set([
  "registered",
  "candidate",
  "probed_zero",
  "probed_rejected",
  "duplicate_of_registered",
]);
const PROVIDERS = new Set([
  "greenhouse",
  "lever",
  "ashby",
  "workable",
  "smartrecruiters",
  null,
]);

function loadRegistry() {
  return JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
}

function check(registry) {
  const problems = [];
  if (registry.schemaVersion !== 1) problems.push("schemaVersion must be 1");
  const seen = new Set();
  for (const [index, board] of registry.boards.entries()) {
    const label = `boards[${index}] (${board.companyName ?? "?"})`;
    if (!board.companyName) problems.push(`${label}: companyName required`);
    if (!board.canonicalDomain)
      problems.push(`${label}: canonicalDomain required`);
    if (!STATUSES.has(board.status))
      problems.push(`${label}: invalid status ${board.status}`);
    if (!PROVIDERS.has(board.atsProvider ?? null)) {
      problems.push(`${label}: invalid atsProvider ${board.atsProvider}`);
    }
    if (
      board.atsProvider &&
      !board.boardIdentifier &&
      board.status !== "candidate"
    ) {
      problems.push(`${label}: provider without boardIdentifier`);
    }
    if (board.status === "probed_rejected" && !board.rejectionReason) {
      problems.push(`${label}: probed_rejected requires rejectionReason`);
    }
    if (
      (board.status === "probed_zero" ||
        board.status === "probed_rejected" ||
        board.status === "registered") &&
      !board.lastProbedAt
    ) {
      problems.push(`${label}: probe-evidenced status requires lastProbedAt`);
    }
    const key = `${board.atsProvider ?? "none"}:${board.boardIdentifier ?? board.canonicalDomain}`;
    if (seen.has(key)) problems.push(`${label}: duplicate board ${key}`);
    seen.add(key);
  }
  return problems;
}

function probeUrl(board) {
  const tenant = board.boardIdentifier;
  switch (board.atsProvider) {
    case "greenhouse":
      return `https://boards-api.greenhouse.io/v1/boards/${tenant}/jobs`;
    case "lever":
      return `https://api.lever.co/v0/postings/${tenant}?mode=json`;
    case "ashby":
      return `https://api.ashbyhq.com/posting-api/job-board/${tenant}`;
    case "workable":
      return `https://apply.workable.com/api/v1/widget/accounts/${tenant}?details=false`;
    default:
      return null;
  }
}

function countRoles(provider, payload) {
  if (provider === "lever")
    return Array.isArray(payload) ? payload.length : null;
  if (provider === "ashby")
    return Array.isArray(payload?.jobs) ? payload.jobs.length : null;
  return Array.isArray(payload?.jobs) ? payload.jobs.length : null;
}

const MAX_PROBE_RESPONSE_BYTES = 4 * 1024 * 1024;

async function readBoundedProbeJson(response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PROBE_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

async function probe(registry, limit) {
  const today = new Date().toISOString().slice(0, 10);
  const targets = registry.boards
    .filter(
      (board) =>
        (board.status === "candidate" || board.status === "probed_zero") &&
        board.atsProvider &&
        board.boardIdentifier,
    )
    .slice(0, limit);
  for (const board of targets) {
    const url = probeUrl(board);
    if (!url) continue;
    let openRoles = null;
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "SalaryPadi/1.0 (+https://salarypadi.com/about)",
        },
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        openRoles = countRoles(
          board.atsProvider,
          await readBoundedProbeJson(response),
        );
      }
    } catch {
      openRoles = null;
    }
    board.lastProbedAt = today;
    board.lastProbeOpenRoles = openRoles;
    if (board.status !== "registered") {
      board.status = openRoles === 0 ? "probed_zero" : board.status;
    }
    console.log(
      `${board.atsProvider}/${board.boardIdentifier}: ${openRoles === null ? "unreachable_or_absent" : `${openRoles} open roles`}`,
    );
    await sleep(2_000);
  }
  writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
}

const registry = loadRegistry();
const problems = check(registry);
if (problems.length > 0) {
  console.error("Board registry problems:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(
  `Board registry OK: ${registry.boards.length} boards (` +
    `${registry.boards.filter((b) => b.status === "registered").length} registered, ` +
    `${registry.boards.filter((b) => b.status === "candidate").length} candidates).`,
);

if (process.argv.includes("--probe")) {
  const index = process.argv.indexOf("--probe");
  const limit = Number.parseInt(process.argv[index + 1] ?? "5", 10) || 5;
  await probe(registry, limit);
}
