// Workable board discovery for African markets.
//
//   node scripts/discover-workable-tenants.mjs [--markets NG,KE] [--verify N]
//
// Walks Workable's public cross-tenant job search per African market, derives
// each employer's board slug from the company URL, then verifies that slug
// against the SAME public widget endpoint the shipped Workable adapter uses
// (buildWorkableEndpoint). Verification records total roles, the African share,
// country spread and the newest posting date, so zombie boards and staffing
// marketplaces are rejected here rather than after registration.
//
// Discovery guardrails, unchanged from validate-board-registry.mjs: documented
// public ATS endpoints only, no login, no CAPTCHA, no HTML scraping, no
// identity rotation, bounded readers and polite spacing. Discovery NEVER
// registers a source — it writes candidates for the manual rights review.
//
// Outputs:
//   output/workable-discovery.json  full evidence per board
//   output/workable-candidates.csv  import-board-candidates.mjs input

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const SEARCH_URL = "https://jobs.workable.com/api/v1/jobs";
const WIDGET_URL = "https://apply.workable.com/api/v1/widget/accounts";
const USER_AGENT = "SalaryPadi/1.0 (+https://salarypadi.com/about)";
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const SEARCH_SPACING_MS = 350;
const VERIFY_SPACING_MS = 450;
const MAX_PAGES_PER_MARKET = 120;

// Nigeria first, then the rest of the African footprint, then remote.
const MARKETS = [
  { code: "NG", location: "Nigeria" },
  { code: "KE", location: "Kenya" },
  { code: "GH", location: "Ghana" },
  { code: "ZA", location: "South Africa" },
  { code: "EG", location: "Egypt" },
  { code: "UG", location: "Uganda" },
  { code: "TZ", location: "Tanzania" },
  { code: "RW", location: "Rwanda" },
  { code: "SN", location: "Senegal" },
  { code: "CI", location: "Ivory Coast" },
  { code: "MA", location: "Morocco" },
  { code: "ET", location: "Ethiopia" },
  { code: "ZM", location: "Zambia" },
];

const AFRICAN_COUNTRIES = new Set(
  MARKETS.map((m) => m.location.toLowerCase()).concat([
    "cote d'ivoire",
    "côte d'ivoire",
    "tanzania, united republic of",
  ]),
);

// Boards confirmed to republish other employers' postings. Ingesting these
// would make SalaryPadi a mirror of another aggregator, not a source of truth.
const KNOWN_AGGREGATORS = new Set([
  "huzzle",
  "hire-overseas",
  "talentgrator",
  "global-pacific-support",
]);

const AGGREGATOR_ROLE_FLOOR = 250;
const AGGREGATOR_COUNTRY_FLOOR = 15;
const ZOMBIE_AGE_DAYS = 365;

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

async function readBoundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
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

async function getJson(url) {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return { ok: false, status: response.status, json: null };
    return {
      ok: true,
      status: response.status,
      json: await readBoundedJson(response),
    };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

function hostnameOf(website) {
  try {
    return new URL(website).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function slugFromCompanyUrl(url) {
  return /\/jobs-at-([a-z0-9-]+)/.exec(url ?? "")?.[1] ?? null;
}

async function searchMarket(market, companies) {
  let token = null;
  let pages = 0;
  let seen = 0;
  let totalSize = null;
  for (;;) {
    const url =
      `${SEARCH_URL}?query=&location=${encodeURIComponent(market.location)}` +
      (token ? `&pageToken=${encodeURIComponent(token)}` : "");
    const { json } = await getJson(url);
    const jobs = json?.jobs ?? [];
    if (totalSize === null) totalSize = json?.totalSize ?? null;
    if (jobs.length === 0) break;
    for (const job of jobs) {
      const company = job.company;
      const slug = slugFromCompanyUrl(company?.url);
      if (!company?.title || !slug) continue;
      seen += 1;
      const existing = companies.get(slug);
      if (existing) {
        existing.markets.add(market.code);
        existing.searchHits += 1;
      } else {
        companies.set(slug, {
          boardIdentifier: slug,
          companyName: company.title,
          website: company.website ?? null,
          canonicalDomain: hostnameOf(company.website),
          markets: new Set([market.code]),
          searchHits: 1,
        });
      }
    }
    pages += 1;
    token = json?.nextPageToken ?? null;
    if (!token || pages >= MAX_PAGES_PER_MARKET) break;
    await sleep(SEARCH_SPACING_MS);
  }
  console.log(
    `  ${market.location.padEnd(14)} totalSize=${String(totalSize ?? "?").padStart(5)} pages=${String(pages).padStart(3)} jobsSeen=${String(seen).padStart(5)} distinctBoards=${companies.size}`,
  );
  return {
    market: market.code,
    location: market.location,
    totalSize,
    pages,
    seen,
  };
}

function summarizeWidget(payload) {
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : null;
  if (!jobs) return null;
  const countries = new Set();
  let africanRoles = 0;
  let newest = null;
  for (const job of jobs) {
    const country = (job.country ?? "").trim();
    if (country) countries.add(country);
    if (AFRICAN_COUNTRIES.has(country.toLowerCase())) africanRoles += 1;
    const published = job.published_on ?? null;
    if (published && (newest === null || published > newest))
      newest = published;
  }
  return {
    totalRoles: jobs.length,
    africanRoles,
    countryCount: countries.size,
    countries: [...countries].slice(0, 12),
    newestPostingDate: newest,
    accountName: payload?.name ?? null,
  };
}

function classify(board) {
  const evidence = board.evidence;
  if (!evidence)
    return {
      status: "unreachable",
      reason: "widget endpoint did not return a job array",
    };
  if (KNOWN_AGGREGATORS.has(board.boardIdentifier)) {
    return {
      status: "probed_rejected",
      reason: "aggregator_board: republishes other employers' postings",
    };
  }
  if (evidence.totalRoles === 0)
    return { status: "probed_zero", reason: "no open roles at probe" };
  if (
    evidence.totalRoles >= AGGREGATOR_ROLE_FLOOR &&
    evidence.countryCount >= AGGREGATOR_COUNTRY_FLOOR
  ) {
    return {
      status: "probed_rejected",
      reason: `suspected_aggregator: ${evidence.totalRoles} roles across ${evidence.countryCount} countries`,
    };
  }
  if (evidence.newestPostingDate) {
    const ageDays =
      (Date.now() - Date.parse(evidence.newestPostingDate)) / 86_400_000;
    if (ageDays > ZOMBIE_AGE_DAYS) {
      return {
        status: "probed_rejected",
        reason: `zombie_board: newest posting ${evidence.newestPostingDate}`,
      };
    }
  }
  if (evidence.africanRoles === 0) {
    return {
      status: "probed_zero",
      reason: "no African roles on the board at probe",
    };
  }
  return { status: "ready_for_rights_review", reason: null };
}

function toCsv(boards) {
  const header = [
    "companyName",
    "canonicalDomain",
    "atsProvider",
    "boardIdentifier",
    "careersUrl",
    "countriesOfOperation",
    "discoverySource",
  ];
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows = boards.map((board) =>
    [
      board.companyName,
      board.canonicalDomain,
      "workable",
      board.boardIdentifier,
      `https://apply.workable.com/${board.boardIdentifier}/`,
      [...board.markets].join(";"),
      "workable_africa_search_sweep",
    ]
      .map(escape)
      .join(","),
  );
  return `${[header.join(","), ...rows].join("\n")}\n`;
}

async function main() {
  const only = arg("--markets");
  const markets = only
    ? MARKETS.filter((m) => only.split(",").includes(m.code))
    : MARKETS;
  const verifyLimit =
    Number.parseInt(arg("--verify", "0") ?? "0", 10) || Infinity;

  console.log(
    `Searching ${markets.length} markets on Workable's public job search:`,
  );
  const companies = new Map();
  const marketStats = [];
  for (const market of markets) {
    marketStats.push(await searchMarket(market, companies));
    await sleep(SEARCH_SPACING_MS);
  }

  const boards = [...companies.values()].sort(
    (a, b) => b.searchHits - a.searchHits,
  );
  console.log(
    `\nDistinct boards discovered: ${boards.length}. Verifying against the widget endpoint...\n`,
  );

  let verified = 0;
  for (const board of boards) {
    if (verified >= verifyLimit) {
      board.status = "candidate";
      board.reason = "not verified in this run";
      continue;
    }
    const { json } = await getJson(
      `${WIDGET_URL}/${encodeURIComponent(board.boardIdentifier)}`,
    );
    board.evidence = summarizeWidget(json);
    const verdict = classify(board);
    board.status = verdict.status;
    board.reason = verdict.reason;
    verified += 1;
    const e = board.evidence;
    console.log(
      `${board.status.padEnd(24)} ${board.boardIdentifier.padEnd(34)} ` +
        `roles=${String(e?.totalRoles ?? "-").padStart(4)} africa=${String(e?.africanRoles ?? "-").padStart(4)} ` +
        `newest=${e?.newestPostingDate ?? "-"}  ${board.companyName}`,
    );
    await sleep(VERIFY_SPACING_MS);
  }

  const serializable = boards.map((board) => ({
    ...board,
    markets: [...board.markets],
  }));
  const ready = serializable.filter(
    (b) => b.status === "ready_for_rights_review",
  );
  const counts = serializable.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] ?? 0) + 1;
    return acc;
  }, {});

  mkdirSync(resolve(process.cwd(), "output"), { recursive: true });
  writeFileSync(
    resolve(process.cwd(), "output/workable-discovery.json"),
    `${JSON.stringify({ discoveredAt: new Date().toISOString().slice(0, 10), marketStats, counts, boards: serializable }, null, 2)}\n`,
  );
  writeFileSync(
    resolve(process.cwd(), "output/workable-candidates.csv"),
    toCsv(ready.filter((b) => b.canonicalDomain)),
  );

  const africanRoleTotal = ready.reduce(
    (sum, b) => sum + (b.evidence?.africanRoles ?? 0),
    0,
  );
  console.log(`\n=== Discovery summary ===`);
  console.log(JSON.stringify(counts, null, 2));
  console.log(
    `Ready for rights review: ${ready.length} boards, ${africanRoleTotal} African roles.`,
  );
  console.log(
    `Wrote output/workable-discovery.json and output/workable-candidates.csv.`,
  );
}

await main();
