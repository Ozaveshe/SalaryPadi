// Employer board registry tooling.
//
//   node scripts/validate-board-registry.mjs --check
//     Structural validation only (no network): schema, unique identifiers,
//     status vocabulary, strong domain/URL/country/date validation. CI-safe.
//
//   node scripts/validate-board-registry.mjs --probe [N]
//     Probes up to N (default 5, capped at 50) boards, ORDERED BY OLDEST
//     lastProbedAt (never-probed first) so no cohort is starved by always
//     re-probing the first records. Documented public ATS board APIs only,
//     2s spacing, bounded 4MB reader. Updates probe evidence and writes a
//     structured report to output/board-probe-report.json. Probing NEVER
//     registers a source: registration stays the manual rights-review recipe.
//
// Discovery guardrails: only documented public ATS APIs are probed
// (Greenhouse boards-api, Lever postings, Ashby posting-api, Workable widget,
// SmartRecruiters postings). No login, CAPTCHA, HTML scraping or identity
// rotation.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const REGISTRY_PATH = resolve(
  process.cwd(),
  "config/employer-board-registry.json",
);
const REPORT_PATH = resolve(process.cwd(), "output/board-probe-report.json");
const MAX_PROBE_LIMIT = 50;
const MAX_PROBE_RESPONSE_BYTES = 4 * 1024 * 1024;

const STATUSES = new Set([
  "registered",
  "candidate",
  "probed_positive",
  "probed_zero",
  "probed_rejected",
  "ready_for_rights_review",
  "unreachable",
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
// 2-letter ISO country codes plus the registry's remote-scope tokens.
const COUNTRY_TOKEN = /^([A-Z]{2}|remote_[a-z]+)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HOSTNAME = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+$/;

function loadRegistry() {
  return JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
}

function isValidHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function check(registry) {
  const problems = [];
  if (registry.schemaVersion !== 1) problems.push("schemaVersion must be 1");
  const seen = new Set();
  for (const [index, board] of registry.boards.entries()) {
    const label = `boards[${index}] (${board.companyName ?? "?"})`;
    if (!board.companyName) problems.push(`${label}: companyName required`);
    if (!board.canonicalDomain || !HOSTNAME.test(board.canonicalDomain)) {
      problems.push(`${label}: canonicalDomain must be a valid host`);
    }
    if (!STATUSES.has(board.status)) {
      problems.push(`${label}: invalid status ${board.status}`);
    }
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
    if (board.careersUrl != null && !isValidHttpsUrl(board.careersUrl)) {
      problems.push(`${label}: careersUrl must be https`);
    }
    if (!Array.isArray(board.countriesOfOperation)) {
      problems.push(`${label}: countriesOfOperation must be an array`);
    } else {
      for (const code of board.countriesOfOperation) {
        if (!COUNTRY_TOKEN.test(code)) {
          problems.push(`${label}: invalid country token ${code}`);
        }
      }
    }
    if (board.lastProbedAt != null && !DATE.test(board.lastProbedAt)) {
      problems.push(`${label}: lastProbedAt must be YYYY-MM-DD`);
    }
    if (board.status === "probed_rejected" && !board.rejectionReason) {
      problems.push(`${label}: probed_rejected requires rejectionReason`);
    }
    if (
      [
        "probed_zero",
        "probed_positive",
        "probed_rejected",
        "registered",
      ].includes(board.status) &&
      !board.lastProbedAt
    ) {
      problems.push(`${label}: probe-evidenced status requires lastProbedAt`);
    }
    const key = `${board.atsProvider ?? "none"}:${
      board.boardIdentifier ?? board.canonicalDomain
    }`;
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
    case "smartrecruiters":
      return `https://api.smartrecruiters.com/v1/companies/${tenant}/postings?limit=100`;
    default:
      return null;
  }
}

function countRoles(provider, payload) {
  if (provider === "lever")
    return Array.isArray(payload) ? payload.length : null;
  if (provider === "ashby") {
    return Array.isArray(payload?.jobs) ? payload.jobs.length : null;
  }
  if (provider === "smartrecruiters") {
    if (typeof payload?.totalFound === "number") return payload.totalFound;
    return Array.isArray(payload?.content) ? payload.content.length : null;
  }
  return Array.isArray(payload?.jobs) ? payload.jobs.length : null;
}

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

async function probe(registry, requested) {
  const limit = Math.min(
    Math.max(1, Number.parseInt(requested ?? "5", 10) || 5),
    MAX_PROBE_LIMIT,
  );
  const today = new Date().toISOString().slice(0, 10);
  // Fair ordering: never-probed first, then oldest lastProbedAt. Re-probe the
  // probeable cohort, not just the first N records in file order.
  const probeable = registry.boards
    .filter(
      (board) =>
        ["candidate", "probed_zero", "probed_positive", "unreachable"].includes(
          board.status,
        ) &&
        board.atsProvider &&
        board.boardIdentifier,
    )
    .sort((a, b) => (a.lastProbedAt ?? "").localeCompare(b.lastProbedAt ?? ""));

  const report = { probedAt: today, limit, results: [] };
  for (const board of probeable.slice(0, limit)) {
    const url = probeUrl(board);
    if (!url) continue;
    let openRoles = null;
    let reachable = false;
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
        reachable = true;
        openRoles = countRoles(
          board.atsProvider,
          await readBoundedProbeJson(response),
        );
      }
    } catch {
      reachable = false;
    }

    board.lastProbedAt = today;
    board.lastProbeOpenRoles = openRoles;
    if (board.status !== "registered" && board.status !== "probed_rejected") {
      if (!reachable || openRoles === null) {
        // Inconclusive: do not keep a stale probed_zero. Mark unreachable so
        // the fair-ordering re-probes it, rather than trusting an old zero.
        board.status = "unreachable";
      } else if (openRoles > 0) {
        // Live roles found — flag for a human rights review; never auto-register.
        board.status = "ready_for_rights_review";
      } else {
        board.status = "probed_zero";
      }
    }
    report.results.push({
      companyName: board.companyName,
      provider: board.atsProvider,
      boardIdentifier: board.boardIdentifier,
      reachable,
      openRoles,
      status: board.status,
    });
    console.log(
      `${board.atsProvider}/${board.boardIdentifier}: ${
        openRoles === null ? "unreachable_or_absent" : `${openRoles} open roles`
      } -> ${board.status}`,
    );
    await sleep(2_000);
  }
  writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
  mkdirSync(resolve(process.cwd(), "output"), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nProbe report written to ${REPORT_PATH}.`);
}

const registry = loadRegistry();
const problems = check(registry);
if (problems.length > 0) {
  console.error("Board registry problems:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
const counts = registry.boards.reduce((acc, board) => {
  acc[board.status] = (acc[board.status] ?? 0) + 1;
  return acc;
}, {});
console.log(
  `Board registry OK: ${registry.boards.length} boards ${JSON.stringify(counts)}.`,
);

if (process.argv.includes("--probe")) {
  const index = process.argv.indexOf("--probe");
  await probe(registry, process.argv[index + 1]);
}
