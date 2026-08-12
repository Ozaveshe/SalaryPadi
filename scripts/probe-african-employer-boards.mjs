// Probe named African employers for a public ATS board on any provider the
// worker can actually parse.
//
//   node scripts/probe-african-employer-boards.mjs [--out output/board-probe.json]
//
// WHY THIS SHAPE
//
// The earlier Workable sweep worked the other way round: it asked the vendor
// which boards exist and registered what came back. That found 108 sources and
// 43 of them never put a single role in front of a Nigerian candidate, because
// "board exists" and "employer hires here" are different questions. This asks
// the second question first -- the candidate list is employers known to hire in
// Nigeria or across Africa -- and only then looks for a board.
//
// Slugs are guessed from the employer name, so a hit is not yet evidence of
// anything. It says a board answered on that slug. Identity still has to be
// corroborated against the employer's own domain before registration, which is
// what the registration recipe's 'domain_verified' claim rests on.
//
// Endpoints mirror src/lib/jobs/ats/endpoints.ts exactly. Probing a provider
// this repo cannot parse would produce candidates that can never be ingested.

import { Buffer } from "node:buffer";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const USER_AGENT = "SalaryPadi/1.0 (+https://salarypadi.com/about)";
const CONCURRENCY = 8;
const SPACING_MS = 120;
const REQUEST_TIMEOUT_MS = 15_000;
/**
 * A board answering on a guessed slug is untrusted input and can be very large
 * (Canonical alone serves 303 roles with full descriptions). Read to a ceiling
 * rather than buffering whatever the host decides to send.
 */
const MAX_BOARD_BYTES = 8 * 1024 * 1024;

async function readBoundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BOARD_BYTES) {
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

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const OUT_PATH = resolve(
  process.cwd(),
  arg("--out", "output/board-probe.json"),
);

/**
 * Employers to look for, grouped only so the list stays readable. Membership
 * here is a claim that the employer hires in Nigeria or elsewhere in Africa --
 * nothing more. It is not a claim that a board exists.
 */
const EMPLOYERS = [
  // Nigerian fintech and technology
  "Flutterwave",
  "Paystack",
  "Interswitch",
  "Andela",
  "Paga",
  "Carbon",
  "Cowrywise",
  "PiggyVest",
  "OPay",
  "PalmPay",
  "Bamboo",
  "Risevest",
  "Chipper Cash",
  "Mono",
  "Okra",
  "Termii",
  "Seamfix",
  "SystemSpecs",
  "Remita",
  "TeamApt",
  "Lemfi",
  "Grey",
  "Bitnob",
  "Yellow Card",
  "Nomba",
  "Prospa",
  "Brass",
  "Sparkle",
  "Eyowo",
  "Duplo",
  "Anchor",
  "Fincra",
  "Klasha",
  "Lidya",
  "Aella",
  "Umba",
  "Sycamore",
  "Kobo360",
  "Gokada",
  "Max NG",
  "Helium Health",
  "Reliance Health",
  "Wellahealth",
  "Tremendoc",
  "Autochek",
  "Cars45",
  "Jiji",
  "Konga",
  "PayDay",
  "Bankly",
  "VerifyMe",
  "Smile Identity",
  "Youverify",
  "Curacel",
  "Casava",
  "ETAP",
  "Send",
  "Trade Depot",
  "Sabi",
  "Alerzo",
  "Omnibiz",
  "Vendease",
  "Releaf",
  "Farmcrowdy",
  "ThriveAgric",
  "Crop2Cash",
  "Hotels ng",
  "Piggyvest",

  // Pan-African technology, energy and logistics
  "Wave",
  "Onafriq",
  "MFS Africa",
  "Cellulant",
  "M-KOPA",
  "Sun King",
  "d.light",
  "Twiga Foods",
  "Copia Global",
  "Sendy",
  "Lori Systems",
  "mPharma",
  "54gene",
  "BasiGo",
  "Roam",
  "Yoco",
  "JUMO",
  "TymeBank",
  "Lulalend",
  "Peach Payments",
  "Stitch",
  "Ozow",
  "Naked",
  "Aerobotics",
  "SweepSouth",
  "Takealot",
  "Superbalist",
  "Luno",
  "VALR",
  "Bitcoin ke",
  "Turaco",
  "Pula",
  "Apollo Agriculture",
  "iProcure",
  "Wasoko",
  "MarketForce",
  "Kyosk",
  "Zipline",
  "Gro Intelligence",
  "Instadeep",
  "Kudi",

  // Telecoms, banking and industrials with African footprints
  "MTN",
  "Airtel Africa",
  "Ecobank",
  "Standard Bank",
  "Absa",
  "Nedbank",
  "Stanbic IBTC",
  "Access Bank",
  "Guaranty Trust",
  "Zenith Bank",
  "United Bank for Africa",
  "Dangote",
  "BUA Group",
  "Seplat",
  "Oando",
  "Flour Mills",
  "PZ Cussons",
  "Nigerian Breweries",
  "Guinness Nigeria",
  "Lafarge Africa",
  "Julius Berger",
  "Shoprite",
  "Jumia",
  "Bolt",
  "Uber",

  // Development, health and humanitarian organisations hiring in Nigeria
  "One Acre Fund",
  "Norwegian Refugee Council",
  "International Rescue Committee",
  "Save the Children",
  "Mercy Corps",
  "Danish Refugee Council",
  "Oxfam",
  "Plan International",
  "WaterAid",
  "Malaria Consortium",
  "Sightsavers",
  "eHealth Africa",
  "Clinton Health Access Initiative",
  "PATH",
  "Jhpiego",
  "FHI 360",
  "Palladium",
  "Chemonics",
  "DAI",
  "Abt Associates",
  "IDinsight",
  "Evidence Action",
  "Living Goods",
  "Last Mile Health",
  "Amref",
  "Population Services International",
  "Marie Stopes",
  "BRAC",
  "Acumen",
  "TechnoServe",
  "Heifer International",
  "Solidaridad",
  "SNV",
  "GAIN",
  "Alliance for a Green Revolution in Africa",
  "African Development Bank",

  // Remote-first employers that hire across Africa
  "Canonical",
  "GitLab",
  "Automattic",
  "Toptal",
  "Turing",
  "Deel",
  "Remote",
  "Oyster",
  "Multiplier",
  "Andela",
  "Tek Experts",
  "Sama",
  "CloudFactory",
  "iMerit",
  "Scale AI",
  "Invisible Technologies",
];

/** Slug spellings an employer plausibly uses on an ATS tenant URL. */
function slugCandidates(name) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[^a-z0-9\s-]/g, "")
    .trim();
  const words = base.split(/\s+/).filter(Boolean);
  const joined = words.join("");
  const hyphenated = words.join("-");
  // Drop a trailing corporate/geographic qualifier: employers rarely put
  // "group", "africa" or "nigeria" in the tenant slug even when the brand
  // carries it.
  const trimmed = words.filter(
    (w) =>
      ![
        "group",
        "africa",
        "nigeria",
        "ng",
        "international",
        "global",
        "holdings",
        "limited",
        "ltd",
        "plc",
        "inc",
      ].includes(w),
  );
  const candidates = new Set([joined, hyphenated]);
  if (trimmed.length && trimmed.length !== words.length) {
    candidates.add(trimmed.join(""));
    candidates.add(trimmed.join("-"));
  }
  // Tenant slugs must satisfy src/lib/jobs/ats/endpoints.ts.
  return [...candidates].filter((s) => /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(s));
}

const PROVIDERS = [
  {
    name: "greenhouse",
    url: (t) => `https://boards-api.greenhouse.io/v1/boards/${t}/jobs`,
    jobs: (b) => b?.jobs ?? [],
    location: (j) => j.location?.name ?? "",
    updated: (j) => j.updated_at ?? "",
  },
  {
    name: "workable",
    url: (t) =>
      `https://apply.workable.com/api/v1/widget/accounts/${t}?details=true`,
    jobs: (b) => b?.jobs ?? [],
    location: (j) => [j.city, j.state, j.country].filter(Boolean).join(", "),
    updated: (j) => j.published ?? j.published_on ?? "",
  },
  {
    name: "lever",
    url: (t) => `https://api.lever.co/v0/postings/${t}?mode=json`,
    jobs: (b) => (Array.isArray(b) ? b : []),
    location: (j) => j.categories?.location ?? "",
    updated: (j) => (j.createdAt ? new Date(j.createdAt).toISOString() : ""),
  },
  {
    name: "ashby",
    url: (t) => `https://api.ashbyhq.com/posting-api/job-board/${t}`,
    jobs: (b) => b?.jobs ?? [],
    location: (j) => j.location ?? "",
    updated: (j) => j.publishedAt ?? "",
  },
  {
    name: "smartrecruiters",
    url: (t) =>
      `https://api.smartrecruiters.com/v1/companies/${t}/postings?limit=100`,
    jobs: (b) => b?.content ?? [],
    location: (j) =>
      j.location?.fullLocation ??
      [j.location?.city, j.location?.region, j.location?.country]
        .filter(Boolean)
        .join(", "),
    updated: (j) => j.releasedDate ?? "",
  },
];

const NIGERIA =
  /nigeria|lagos|abuja|ibadan|kano|port\s*harcourt|benin city|enugu|kaduna|ikoyi|victoria island|abeokuta|jos|ilorin|minna|bauchi|maiduguri|calabar|uyo|owerri|akure|oyo/i;
const AFRICA =
  /africa|nigeria|kenya|ghana|south africa|egypt|morocco|tanzania|uganda|rwanda|ethiopia|senegal|zambia|zimbabwe|botswana|malawi|mozambique|angola|cameroon|ivory coast|c[ôo]te d.?ivoire|tunisia|algeria|namibia|burundi|somalia|sudan|mali|burkina|niger|togo|benin|sierra leone|liberia|gambia|guinea|madagascar|mauritius|lesotho|eswatini|nairobi|accra|cairo|johannesburg|cape town|kigali|kampala|dar es salaam|addis|dakar|casablanca|lusaka|harare|abidjan|douala|yaound/i;
const REMOTE = /remote|anywhere|worldwide|global|distributed/i;

async function probe(tenant, provider) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(provider.url(tenant), {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("json")) return null;
    const body = await readBoundedJson(response);
    if (body === null) return null;
    const jobs = provider.jobs(body);
    if (!Array.isArray(jobs) || jobs.length === 0) return null;

    let nigerian = 0;
    let african = 0;
    let remote = 0;
    let newest = "";
    const locations = new Map();
    for (const job of jobs) {
      const where = String(provider.location(job) ?? "");
      if (NIGERIA.test(where)) nigerian += 1;
      if (AFRICA.test(where)) african += 1;
      if (REMOTE.test(where)) remote += 1;
      const when = String(provider.updated(job) ?? "");
      if (when > newest) newest = when;
      locations.set(
        where || "(unstated)",
        (locations.get(where || "(unstated)") ?? 0) + 1,
      );
    }
    return {
      tenant,
      provider: provider.name,
      roles: jobs.length,
      nigerian,
      african,
      remote,
      newest,
      topLocations: [...locations.entries()]
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

/** Every (employer, slug, provider) probe this run will make. */
const work = [];
for (const employer of new Set(EMPLOYERS)) {
  for (const tenant of slugCandidates(employer)) {
    for (const provider of PROVIDERS) work.push({ employer, tenant, provider });
  }
}

console.log(`Probing ${work.length} (employer, slug, provider) combinations…`);

const hits = [];
let index = 0;
let done = 0;
async function worker() {
  while (index < work.length) {
    const item = work[index++];
    const result = await probe(item.tenant, item.provider);
    done += 1;
    if (done % 200 === 0) console.log(`  …${done}/${work.length}`);
    if (result) {
      hits.push({ employer: item.employer, ...result });
      console.log(
        `  HIT ${item.employer} -> ${result.provider}/${result.tenant}: ` +
          `${result.roles} roles, ${result.nigerian} NG, ${result.african} AFR`,
      );
    }
    await sleep(SPACING_MS);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

hits.sort(
  (a, b) =>
    b.nigerian - a.nigerian || b.african - a.african || b.roles - a.roles,
);
mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(
  OUT_PATH,
  JSON.stringify({ probedAt: new Date().toISOString(), hits }, null, 2),
);

console.log(`\n${hits.length} boards answered. Written to ${OUT_PATH}`);
console.log(
  `With Nigerian roles: ${hits.filter((h) => h.nigerian > 0).length}`,
);
console.log(`With African roles:  ${hits.filter((h) => h.african > 0).length}`);
