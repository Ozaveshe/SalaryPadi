// Derive Nigeria salary benchmark cells from the Coresignal salaried-postings
// corpus (reports/coresignal-salary-corpus-2026-07.jsonl) and emit the
// applied-data SQL for the reviewed_snapshot lane.
//
// Honesty rules (each is also recorded in normalization_assumptions):
// - NGN monthly-period salary entries only; no cross-period conversion.
// - Postings dated within the last 12 months only (naira inflation makes
//   older observations misleading in a current benchmark).
// - Midpoint of the advertised range; bounds guard against garbage values.
// - One salary observation per posting; exact company+title+salary dedupe.
// - A cell publishes only with n >= 10 spanning >= 5 distinct employers.
//
// Usage: node scripts/derive-coresignal-salary-benchmarks.mjs

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CORPUS = path.join(
  ROOT,
  "reports",
  "coresignal-salary-corpus-2026-07.jsonl",
);
const OUT_SQL = path.join(
  ROOT,
  "docs",
  "data",
  "20260730_coresignal_ng_salary_benchmarks.sql",
);

const WINDOW_START = "2025-08-01";
const RETRIEVED_ON = "2026-07-30";
const LOWER_BOUND = 20_000;
const UPPER_BOUND = 50_000_000;
const MIN_CELL_N = 10;
const MIN_CELL_EMPLOYERS = 5;

/**
 * Title classification rules, first match wins. Accounting terms run before
 * sales so Nigerian "Account Officer" (an accounting role) never lands in
 * sales via the bare word "account".
 */
const FAMILY_RULES = [
  [
    "accounting-finance",
    [
      "accountant",
      "account officer",
      "accounts officer",
      "bookkeep",
      "audit",
      "treasury",
      "tax ",
      "tax,",
      "financial analyst",
      "finance officer",
      "finance manager",
      "payroll",
    ],
  ],
  ["nursing", ["nurse", "midwife"]],
  ["pharmacy", ["pharmacist", "pharmacy"]],
  [
    "healthcare-medicine",
    [
      "medical officer",
      "doctor",
      "physician",
      "dentist",
      "surgeon",
      "medical laboratory",
      "optometrist",
      "radiographer",
      "physiotherap",
    ],
  ],
  [
    "education-academia",
    [
      "teacher",
      "tutor",
      "lecturer",
      "instructor",
      "educator",
      "school principal",
      "head of school",
    ],
  ],
  [
    "banking-operations",
    [
      "teller",
      "loan officer",
      "credit officer",
      "credit analyst",
      "relationship officer",
      "relationship manager",
      "banking officer",
      "recovery officer",
    ],
  ],
  ["legal", ["lawyer", "legal", "counsel", "paralegal"]],
  [
    "software-engineering",
    [
      "software engineer",
      "software developer",
      "frontend",
      "front-end",
      "front end developer",
      "backend",
      "back-end",
      "back end developer",
      "full stack",
      "fullstack",
      "mobile developer",
      "web developer",
      "programmer",
      "flutter",
      "react developer",
      "node",
      ".net developer",
      "php developer",
      "python developer",
      "java developer",
    ],
  ],
  [
    "quality-assurance",
    [
      "quality assurance",
      "qa engineer",
      "qa analyst",
      "test engineer",
      "software tester",
    ],
  ],
  [
    "cybersecurity",
    [
      "cybersecurity",
      "cyber security",
      "security engineer",
      "security analyst",
      "soc analyst",
      "penetration",
    ],
  ],
  [
    "data-science",
    [
      "data scientist",
      "data analyst",
      "data engineer",
      "machine learning",
      "business intelligence",
      "analytics",
    ],
  ],
  [
    "devops-infrastructure",
    [
      "devops",
      "site reliability",
      "cloud engineer",
      "infrastructure engineer",
      "system administrator",
      "sysadmin",
      "network engineer",
      "network administrator",
    ],
  ],
  ["product-management", ["product manager", "product owner"]],
  [
    "design",
    [
      "ui/ux",
      "ux designer",
      "ui designer",
      "product designer",
      "graphic designer",
      "graphics designer",
      "brand designer",
      "motion designer",
    ],
  ],
  [
    "project-management",
    [
      "project manager",
      "program manager",
      "project coordinator",
      "project officer",
    ],
  ],
  [
    "human-resources",
    [
      "human resource",
      "hr officer",
      "hr manager",
      "hr business",
      "hr generalist",
      "hr executive",
      "hr assistant",
      "hr/admin",
      "recruiter",
      "talent acquisition",
      "people operations",
      "people manager",
    ],
  ],
  [
    "media-communications",
    [
      "content writer",
      "copywriter",
      "journalist",
      "editor",
      "communications",
      "videographer",
      "photographer",
      "content creator",
      "social media manager",
    ],
  ],
  [
    "marketing",
    [
      "marketing",
      "seo ",
      "seo,",
      "seo specialist",
      "growth",
      "brand manager",
      "digital marketer",
    ],
  ],
  [
    "customer-support",
    [
      "customer service",
      "customer support",
      "customer success",
      "call center",
      "call centre",
      "customer care",
      "client service",
    ],
  ],
  [
    "sales",
    [
      "sales",
      "business development",
      "account executive",
      "account manager",
      "business developer",
      "telemarket",
    ],
  ],
  [
    "logistics-supply-chain",
    [
      "logistics",
      "supply chain",
      "procurement",
      "warehouse",
      "inventory",
      "store keeper",
      "storekeeper",
      "fleet",
      "dispatch",
      "driver",
      "rider",
    ],
  ],
  [
    "engineering",
    [
      "civil engineer",
      "mechanical engineer",
      "electrical engineer",
      "structural engineer",
      "site engineer",
      "quantity surveyor",
      "hvac",
      "maintenance engineer",
      "electrical technician",
      "mechanical technician",
    ],
  ],
  ["public-service", ["administrative officer", "admin officer"]],
];

const FAMILY_NAMES = {
  "accounting-finance": "Accounting and Finance",
  nursing: "Nursing",
  pharmacy: "Pharmacy",
  "healthcare-medicine": "Healthcare and Medicine",
  "education-academia": "Education and Academia",
  "banking-operations": "Banking Operations",
  legal: "Legal",
  "software-engineering": "Software Engineering",
  "quality-assurance": "Quality Assurance",
  cybersecurity: "Cybersecurity",
  "data-science": "Data Science",
  "devops-infrastructure": "DevOps and Infrastructure",
  "product-management": "Product Management",
  design: "Design",
  "project-management": "Project Management",
  "human-resources": "Human Resources",
  "media-communications": "Media and Communications",
  marketing: "Marketing",
  "customer-support": "Customer Support",
  sales: "Sales",
  "logistics-supply-chain": "Logistics and Supply Chain",
  engineering: "Engineering",
  "public-service": "Public Service and Administration",
};

function classify(title) {
  const t = ` ${String(title ?? "").toLowerCase()} `;
  for (const [slug, keywords] of FAMILY_RULES) {
    if (keywords.some((k) => t.includes(k))) return slug;
  }
  return null;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  const value =
    low === high
      ? sorted[low]
      : sorted[low] + (sorted[high] - sorted[low]) * (index - low);
  return Math.round(value / 1000) * 1000;
}

const records = readFileSync(CORPUS, "utf8")
  .split("\n")
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));

const counters = {
  total: records.length,
  notNigeria: 0,
  noDate: 0,
  tooOld: 0,
  volunteer: 0,
  noNgnMonthly: 0,
  outOfBounds: 0,
  duplicate: 0,
  unclassified: 0,
  included: 0,
};
const seen = new Set();
const cells = new Map();

for (const record of records) {
  if (record.market !== "Nigeria") {
    counters.notNigeria += 1;
    continue;
  }
  const posted = (record.date_posted ?? "").slice(0, 10);
  if (!posted) {
    counters.noDate += 1;
    continue;
  }
  if (posted < WINDOW_START) {
    counters.tooOld += 1;
    continue;
  }
  if (record.employment_type === "Volunteer") {
    counters.volunteer += 1;
    continue;
  }
  const entry = (record.salary ?? []).find(
    (s) =>
      s.currency === "NGN" &&
      String(s.period ?? "").toUpperCase() === "MONTH" &&
      Number(s.min) > 0,
  );
  if (!entry) {
    counters.noNgnMonthly += 1;
    continue;
  }
  const midpoint = (Number(entry.min) + Number(entry.max || entry.min)) / 2;
  if (!(midpoint >= LOWER_BOUND && midpoint <= UPPER_BOUND)) {
    counters.outOfBounds += 1;
    continue;
  }
  const dedupeKey = `${record.company}|${record.title}|${entry.min}|${entry.max}`;
  if (seen.has(dedupeKey)) {
    counters.duplicate += 1;
    continue;
  }
  seen.add(dedupeKey);
  const family = classify(record.title);
  if (!family) {
    counters.unclassified += 1;
    continue;
  }
  counters.included += 1;
  if (!cells.has(family)) cells.set(family, []);
  cells.get(family).push({ midpoint, company: record.company, posted });
}

const published = [];
const withheld = [];
for (const [family, observations] of [...cells.entries()].sort()) {
  const employers = new Set(observations.map((o) => o.company)).size;
  const values = observations.map((o) => o.midpoint).sort((a, b) => a - b);
  const dates = observations.map((o) => o.posted).sort();
  const cell = {
    family,
    n: observations.length,
    employers,
    p25: percentile(values, 0.25),
    median: percentile(values, 0.5),
    p75: percentile(values, 0.75),
    from: dates[0],
    to: dates.at(-1),
  };
  if (cell.n >= MIN_CELL_N && employers >= MIN_CELL_EMPLOYERS)
    published.push(cell);
  else withheld.push(cell);
}

console.log("filters:", JSON.stringify(counters));
console.log(
  `published cells: ${published.length}, withheld (under threshold): ${withheld.length}`,
);
for (const cell of published) {
  console.log(
    `  PUBLISH ${cell.family}: n=${cell.n} employers=${cell.employers} p25=${cell.p25} median=${cell.median} p75=${cell.p75} window=${cell.from}..${cell.to}`,
  );
}
for (const cell of withheld) {
  console.log(
    `  withheld ${cell.family}: n=${cell.n} employers=${cell.employers}`,
  );
}

const valuesSql = published
  .map(
    (cell) =>
      `  ('${cell.family}', '${FAMILY_NAMES[cell.family]}', ${cell.p25}, ${cell.median}, ${cell.p75}, ${cell.n}, date '${cell.from}', date '${cell.to}')`,
  )
  .join(",\n");

const sql = `-- Activate the Nigeria market salary benchmark lane derived from the
-- Coresignal salaried-postings corpus (reports/coresignal-salary-corpus-2026-07.jsonl,
-- retrieved ${RETRIEVED_ON}; 1,599 active salaried postings collected under the
-- free trial). Aggregation is a derivative work expressly permitted by the
-- Coresignal Self-Service Subscription Agreement clause 1.2.3 (archived at
-- docs/data/sources/coresignal-self-service-agreement-2026-07-30.md). Raw
-- records are never published; only percentile cells that meet the
-- n >= ${MIN_CELL_N} / >= ${MIN_CELL_EMPLOYERS}-distinct-employer threshold appear here.
-- Regenerate with: node scripts/derive-coresignal-salary-benchmarks.mjs

begin;

insert into app.salary_data_sources (
  source_key, adapter_key, display_name, publisher_name, source_kind,
  dataset_url, methodology_url, terms_url, authorization_basis,
  authorization_evidence_ref, market_country_code, refresh_interval,
  allowed_fields, status, reviewed_at, review_due_at
)
select
  'coresignal_jobs_ng_derived_snapshot', 'reviewed_snapshot',
  'Nigeria market pay percentiles derived from Coresignal job postings (July 2026)',
  'Coresignal (Deeptrace Inc.)', 'licensed_dataset',
  'https://coresignal.com/solutions/jobs-data-api/',
  'https://docs.coresignal.com/jobs-api/multi-source-jobs-api/data-dictionary-multi-source-jobs-api',
  'https://coresignal.com/terms-and-conditions-api-dashboard/',
  'written_licence',
  'Coresignal Self-Service Subscription Agreement cl. 1.2.3 (derivative works); archived copy at docs/data/sources/coresignal-self-service-agreement-2026-07-30.md; corpus at reports/coresignal-salary-corpus-2026-07.jsonl',
  'NG', interval '3 months',
  array[
    'title', 'company_name', 'city', 'country', 'date_posted',
    'salary_min', 'salary_max', 'salary_currency', 'salary_period'
  ],
  'enabled', clock_timestamp(), clock_timestamp() + interval '6 months'
where not exists (
  select 1 from app.salary_data_sources
  where source_key = 'coresignal_jobs_ng_derived_snapshot'
);

insert into app.salary_benchmarks (
  source_id, role_family_id, country_code, currency_code, pay_period,
  gross_net, seniority, engagement_type,
  p25_amount, median_amount, p75_amount,
  p25_annual, median_annual, p75_annual,
  sample_size,
  source_role_code, source_role_label, external_record_id,
  source_url, methodology_url,
  effective_from, effective_to, source_published_at,
  retrieved_at, review_status, reviewed_at, is_current,
  normalization_version, normalization_assumptions
)
select
  source.id, role.id, 'NG', 'NGN', 'monthly',
  'unspecified', 'all', 'unspecified',
  data.p25, data.median, data.p75,
  data.p25 * 12, data.median * 12, data.p75 * 12,
  data.n,
  null, 'Nigerian job postings with disclosed monthly pay — ' || data.family_name,
  'coresignal-ng-2026-07-' || data.role_slug,
  'https://coresignal.com/solutions/jobs-data-api/',
  'https://docs.coresignal.com/jobs-api/multi-source-jobs-api/data-dictionary-multi-source-jobs-api',
  data.window_from, data.window_to, timestamptz '${RETRIEVED_ON} 00:00:00+00',
  clock_timestamp(), 'approved', clock_timestamp(), true,
  'coresignal-ng-derived-${RETRIEVED_ON}',
  jsonb_build_array(
    'Derived from active Nigerian job postings with disclosed NGN monthly pay in the Coresignal Multi-source Jobs dataset, retrieved ${RETRIEVED_ON}',
    'Postings dated ${WINDOW_START} or later only; older observations excluded because naira inflation makes them unrepresentative of current pay',
    'Midpoint of each advertised range; observations outside NGN ${LOWER_BOUND.toLocaleString("en-US")}-${UPPER_BOUND.toLocaleString("en-US")}/month excluded as implausible; exact company+title+range duplicates counted once',
    'Cells publish only with at least ${MIN_CELL_N} postings across at least ${MIN_CELL_EMPLOYERS} distinct employers; sample_size is the posting count, not employee-reported salaries',
    'Monthly values as advertised; annual figures are monthly x 12 with no thirteenth month or allowances assumed',
    'Advertised pay rarely states gross versus net; classification is recorded as unspecified',
    'Aggregation is a derivative work under Coresignal Self-Service Subscription Agreement cl. 1.2.3; individual postings are never republished from this source'
  )
from (values
${valuesSql}
) as data(role_slug, family_name, p25, median, p75, n, window_from, window_to)
join app.role_families role on role.slug = data.role_slug
join app.salary_data_sources source
  on source.source_key = 'coresignal_jobs_ng_derived_snapshot'
where not exists (
  select 1 from app.salary_benchmarks existing
  where existing.external_record_id = 'coresignal-ng-2026-07-' || data.role_slug
);

commit;
`;

writeFileSync(OUT_SQL, sql);
console.log(`\nSQL written: ${OUT_SQL}`);
