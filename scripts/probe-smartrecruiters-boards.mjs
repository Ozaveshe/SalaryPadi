// Probe SmartRecruiters for African employer boards before building an adapter.
//
//   node scripts/probe-smartrecruiters-boards.mjs [--out output/smartrecruiters-probe.json]
//
// WHY THIS RUNS FIRST
//
// SmartRecruiters is the obvious next provider: it publishes a documented
// public Posting API with no authentication, so the 'documented_public_api'
// authorization basis every existing source relies on is confirmable. Workday
// is the other big gap, but its /wday/cxs/ endpoints are undocumented and
// internal, and the conventions are explicit -- a source whose licence cannot
// be confirmed is not used.
//
// Building the adapter is only worth it if the boards carry roles a Nigerian or
// African candidate can actually reach. Registering 43 boards that reached
// nobody is a mistake this codebase has already made once, so the yield gets
// established before any adapter code exists.
//
// Endpoint: https://api.smartrecruiters.com/v1/companies/{id}/postings
// Enterprise ATS tenants skew towards large multinationals and African
// corporates, which is what the employer list reflects.

import { Buffer } from "node:buffer";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const USER_AGENT = "SalaryPadi/1.0 (+https://salarypadi.com/about)";
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;
const CONCURRENCY = 6;
const SPACING_MS = 150;
const PAGE_LIMIT = 100;

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const OUT_PATH = resolve(
  process.cwd(),
  arg("--out", "output/smartrecruiters-probe.json"),
);

/** Provider responses are untrusted input, so read to a ceiling. */
async function readBoundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
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

/**
 * Candidate tenant identifiers. SmartRecruiters slugs are usually the company
 * name without spaces, so several spellings are tried per employer.
 */
const EMPLOYERS = [
  "Bolt",
  "Visa",
  "Nestle",
  "Unilever",
  "Bosch",
  "SiemensAG",
  "Siemens",
  "PhilipsInternational",
  "IKEA",
  "McDonalds",
  "Block",
  "Ubisoft",
  "Equinix",
  "SAP",
  "Wipro",
  "Capgemini",
  "Accenture",
  "Deloitte",
  "MTNGroup",
  "MTN",
  "StandardBank",
  "Absa",
  "Nedbank",
  "OldMutual",
  "Sanlam",
  "Shoprite",
  "TigerBrands",
  "Dangote",
  "DangoteGroup",
  "IHSTowers",
  "AirtelAfrica",
  "Ecobank",
  "Safaricom",
  "EquityBank",
  "KCBGroup",
  "Vodacom",
  "VodafoneGroup",
  "Telkom",
  "Liquid",
  "Andela",
  "SunKing",
  "Greenlight",
  "WaveMobileMoney",
  "Yassir",
  "Glovo",
  "inDrive",
  "Careem",
  "Kaspi",
  "Jumia",
  "Konga",
  "WorldHealthOrganization",
  "UNICEF",
  "UNDP",
  "ILO",
  "IFC",
  "WorldBankGroup",
  "AfricanDevelopmentBank",
  "GIZ",
  "WFP",
  "SavetheChildren",
  "PlanInternational",
  "NorwegianRefugeeCouncil",
  "DanishRefugeeCouncil",
  "MercyCorps",
  "CARE",
  "Oxfam",
  "Novartis",
  "Sanofi",
  "GSK",
  "AstraZeneca",
  "Bayer",
  "Roche",
  "Maersk",
  "DHL",
  "Bollore",
  "TotalEnergies",
  "Schlumberger",
  "SLB",
  "Halliburton",
  "Baker Hughes",
  "BakerHughes",
  "Shell",
  "Chevron",
  "Heineken",
  "Diageo",
  "ABInBev",
  "Coca-ColaHBC",
  "CocaColaHBC",
  "PepsiCo",
  "Danone",
  "Mondelez",
  "Kellogg",
  "Mars",
  "Ericsson",
  "Nokia",
  "Huawei",
  "ZTE",
  "Cisco",
  "Dell",
  "HP",
  "Standard Chartered",
  "StandardChartered",
  "Citi",
  "HSBC",
  "Barclays",
  "PwC",
  "KPMG",
  "EY",
  "McKinsey",
  "BCG",
  "Bain",
];

function slugCandidates(name) {
  const base = name.trim();
  const nospace = base.replaceAll(/\s+/g, "");
  const hyphen = base.replaceAll(/\s+/g, "-");
  return [
    ...new Set([nospace, hyphen, base.toLowerCase().replaceAll(/\s+/g, "")]),
  ].filter((slug) => /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(slug));
}

const NIGERIA =
  /nigeria|lagos|abuja|ibadan|kano|port\s*harcourt|benin city|enugu|kaduna|ikoyi/i;
const AFRICA =
  /africa|nigeria|kenya|ghana|south africa|egypt|morocco|tanzania|uganda|rwanda|ethiopia|senegal|zambia|zimbabwe|botswana|malawi|mozambique|angola|cameroon|ivory|tunisia|algeria|namibia|nairobi|accra|cairo|johannesburg|cape town|kigali|kampala|dar es salaam|addis|dakar|casablanca|lusaka|abidjan/i;

async function probe(tenant) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(tenant)}/postings?limit=${PAGE_LIMIT}`;
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = await readBoundedJson(response);
    const postings = body?.content;
    if (!Array.isArray(postings) || postings.length === 0) return null;

    let nigerian = 0;
    let african = 0;
    let remote = 0;
    let newest = "";
    const places = new Map();
    for (const posting of postings) {
      const location = posting.location ?? {};
      const where = [location.city, location.region, location.country]
        .filter(Boolean)
        .join(", ");
      if (NIGERIA.test(where)) nigerian += 1;
      if (AFRICA.test(where)) african += 1;
      if (location.remote === true) remote += 1;
      const when = String(posting.releasedDate ?? "");
      if (when > newest) newest = when;
      places.set(
        where || "(unstated)",
        (places.get(where || "(unstated)") ?? 0) + 1,
      );
    }
    return {
      tenant,
      totalFound: body.totalFound ?? postings.length,
      sampled: postings.length,
      nigerian,
      african,
      remote,
      newest,
      companyName: postings[0]?.company?.name ?? null,
      topLocations: [...places.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([place, count]) => `${place} x${count}`),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const work = [];
for (const employer of new Set(EMPLOYERS)) {
  for (const tenant of slugCandidates(employer))
    work.push({ employer, tenant });
}

console.log(`Probing ${work.length} SmartRecruiters tenant candidates…`);

const hits = [];
let index = 0;
let done = 0;
async function worker() {
  while (index < work.length) {
    const item = work[index++];
    const result = await probe(item.tenant);
    done += 1;
    if (done % 50 === 0) console.log(`  …${done}/${work.length}`);
    if (result) {
      hits.push({ employer: item.employer, ...result });
      console.log(
        `  HIT ${item.tenant} (${result.companyName ?? "?"}): ${result.totalFound} total, ` +
          `${result.nigerian} NG, ${result.african} AFR`,
      );
    }
    await sleep(SPACING_MS);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

hits.sort((a, b) => b.nigerian - a.nigerian || b.african - a.african);
mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(
  OUT_PATH,
  JSON.stringify({ probedAt: new Date().toISOString(), hits }, null, 2),
);

console.log(
  `\n${hits.length} SmartRecruiters boards answered. Written to ${OUT_PATH}`,
);
console.log(
  `With Nigerian roles: ${hits.filter((h) => h.nigerian > 0).length}`,
);
console.log(`With African roles:  ${hits.filter((h) => h.african > 0).length}`);
