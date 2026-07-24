// Candidate importer for the employer board registry.
//
//   node scripts/import-board-candidates.mjs <file.csv|file.json> [--apply]
//
// Ingests a REVIEWED list of companies and possible ATS identifiers, validates
// and deduplicates them against the existing registry, and places new rows in
// the candidate queue (status "candidate", never registered). Without --apply
// it is a dry run that prints what would be added. Designed to fairly absorb
// large lists (thousands of rows) — dedup is O(n) via a key set, and probing
// order is handled separately by validate-board-registry.mjs.
//
// Accepted columns / keys: companyName, canonicalDomain, atsProvider,
// boardIdentifier, careersUrl, countriesOfOperation (semicolon- or
// comma-separated in CSV), discoverySource.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const REGISTRY_PATH = resolve(
  process.cwd(),
  "config/employer-board-registry.json",
);
const PROVIDERS = new Set([
  "greenhouse",
  "lever",
  "ashby",
  "workable",
  "smartrecruiters",
]);
const HOSTNAME = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+$/;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

function recordsFromCsv(text) {
  const rows = parseCsv(text);
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const record = {};
    header.forEach((key, i) => {
      record[key] = (cells[i] ?? "").trim();
    });
    return record;
  });
}

function normalizeCandidate(record) {
  const countries = (record.countriesOfOperation ?? "")
    .split(/[;,]/)
    .map((c) => c.trim())
    .filter(Boolean);
  const provider = (record.atsProvider ?? "").trim() || null;
  const boardIdentifier = (record.boardIdentifier ?? "").trim() || null;
  return {
    companyName: (record.companyName ?? "").trim(),
    canonicalDomain: (record.canonicalDomain ?? "").trim().toLowerCase(),
    atsProvider: provider && PROVIDERS.has(provider) ? provider : null,
    boardIdentifier,
    careersUrl: (record.careersUrl ?? "").trim() || null,
    countriesOfOperation: countries,
    status: "candidate",
    discoverySource: (record.discoverySource ?? "candidate_import").trim(),
    lastProbedAt: null,
    lastProbeOpenRoles: null,
  };
}

function dedupeKey(board) {
  return `${board.atsProvider ?? "none"}:${
    board.boardIdentifier ?? board.canonicalDomain
  }`;
}

const [, , inputPath] = process.argv;
if (!inputPath) {
  console.error(
    "Usage: import-board-candidates.mjs <file.csv|file.json> [--apply]",
  );
  process.exit(1);
}
const apply = process.argv.includes("--apply");

const raw = readFileSync(resolve(process.cwd(), inputPath), "utf8");
const records = inputPath.endsWith(".json")
  ? JSON.parse(raw)
  : recordsFromCsv(raw);

const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
const existingKeys = new Set(registry.boards.map(dedupeKey));

const added = [];
const skipped = [];
const importSeen = new Set();
for (const record of records) {
  const candidate = normalizeCandidate(record);
  if (!candidate.companyName || !HOSTNAME.test(candidate.canonicalDomain)) {
    skipped.push({ record, reason: "invalid company or domain" });
    continue;
  }
  const key = dedupeKey(candidate);
  if (existingKeys.has(key) || importSeen.has(key)) {
    skipped.push({ record, reason: "duplicate" });
    continue;
  }
  importSeen.add(key);
  added.push(candidate);
}

console.log(
  `Candidate import: ${records.length} rows -> ${added.length} new, ${skipped.length} skipped.`,
);
for (const item of skipped.slice(0, 20)) {
  console.log(`  skip (${item.reason}): ${item.record.companyName ?? "?"}`);
}

if (apply && added.length > 0) {
  registry.boards.push(...added);
  writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
  console.log(`Applied: registry now has ${registry.boards.length} boards.`);
} else if (!apply) {
  console.log("Dry run — re-run with --apply to write these candidates.");
}
