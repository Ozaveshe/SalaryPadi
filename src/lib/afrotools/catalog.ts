import { z } from "zod";

import { readBoundedJson } from "@/lib/http/json";

export const AFROTOOLS_CATALOG_PATH = "/data/tool-directory.json";
export const AFROTOOLS_CATALOG_MAX_BYTES = 2 * 1024 * 1024;
export const AFROTOOLS_CATALOG_FRESH_MS = 7 * 24 * 60 * 60 * 1_000;
export const AFROTOOLS_CATALOG_MAX_STALE_MS = 30 * 24 * 60 * 60 * 1_000;

const catalogToolSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1).max(180),
  description: z.string().min(1).max(600),
  category_key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: z.string().min(1).max(160).optional(),
  countries: z
    .array(z.string().regex(/^(?:ALL|[A-Z]{2})$/))
    .min(1)
    .max(60),
  status: z.literal("Live"),
  language: z.literal("en"),
  last_updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  url: z.string().regex(/^\/[A-Za-z0-9][A-Za-z0-9_./-]*\/?$/),
  priority: z.number().int().min(0).max(100),
});

export type AfroToolsCatalogTool = z.infer<typeof catalogToolSchema>;

export const catalogSnapshotSchema = z.object({
  version: z.literal(1),
  sourceUrl: z.literal("https://afrotools.com/data/tool-directory.json"),
  checkedAt: z.string(),
  catalogLastUpdated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tools: z.array(catalogToolSchema).min(1).max(100),
});

export type AfroToolsCatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;

const careerCategoryKeys = new Set(["career", "hr-payroll"]);
const careerToolIds = new Set([
  "ng-paye",
  "currency-converter",
  "cv-builder",
  "interview-prep",
  "job-offer-evaluator",
  "salary-compare",
  "salary-intelligence",
  "minimum-wage",
  "overtime-calc",
  "leave-calculator",
  "pension-projection",
]);

export function selectCareerTools(value: unknown): AfroToolsCatalogTool[] {
  const parsed = z.array(catalogToolSchema).min(1).max(2_000).safeParse(value);
  if (!parsed.success) throw new Error("AfroTools catalog contract changed.");
  const selected = parsed.data.filter(
    (tool) =>
      careerCategoryKeys.has(tool.category_key) || careerToolIds.has(tool.id),
  );
  if (selected.length < 10) {
    throw new Error("AfroTools career catalog is unexpectedly incomplete.");
  }
  const unique = new Map(selected.map((tool) => [tool.id, tool]));
  return [...unique.values()].sort(
    (a, b) => b.priority - a.priority || a.name.localeCompare(b.name),
  );
}

export async function fetchAfroToolsCatalog(
  apiBaseUrl: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<AfroToolsCatalogSnapshot> {
  const endpoint = new URL(AFROTOOLS_CATALOG_PATH, apiBaseUrl);
  const response = await fetchImpl(endpoint, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    signal,
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`AfroTools catalog returned HTTP ${response.status}.`);
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("AfroTools catalog returned an invalid content type.");
  }
  const payload = await readBoundedJson(response, AFROTOOLS_CATALOG_MAX_BYTES);
  const tools = selectCareerTools(payload);
  return {
    version: 1,
    sourceUrl: "https://afrotools.com/data/tool-directory.json",
    checkedAt: new Date().toISOString(),
    catalogLastUpdated: tools.reduce(
      (latest, tool) =>
        tool.last_updated > latest ? tool.last_updated : latest,
      "1970-01-01",
    ),
    tools,
  };
}

export type CatalogAvailability = {
  snapshot: AfroToolsCatalogSnapshot | null;
  state: "live" | "stale" | "unavailable";
  ageMs: number | null;
};

export function evaluateCatalogSnapshot(
  value: unknown,
  now = new Date(),
): CatalogAvailability {
  const parsed = catalogSnapshotSchema.safeParse(value);
  if (!parsed.success)
    return { snapshot: null, state: "unavailable", ageMs: null };
  const checkedAt = Date.parse(parsed.data.checkedAt);
  const ageMs = now.valueOf() - checkedAt;
  if (!Number.isFinite(checkedAt) || ageMs < -5 * 60 * 1_000) {
    return { snapshot: null, state: "unavailable", ageMs: null };
  }
  if (ageMs > AFROTOOLS_CATALOG_MAX_STALE_MS) {
    return { snapshot: null, state: "unavailable", ageMs };
  }
  return {
    snapshot: parsed.data,
    state: ageMs <= AFROTOOLS_CATALOG_FRESH_MS ? "live" : "stale",
    ageMs,
  };
}

const lkgTools: AfroToolsCatalogTool[] = [
  {
    id: "ng-paye",
    name: "Nigeria PAYE Calculator",
    description:
      "NTA 2026 vs PITA 2025 dual-regime. CRA/Rent Relief, pension, NHF. AI tax advisor + PDF.",
    category_key: "financial",
    category: "Finance, Tax & Market Data",
    countries: ["NG"],
    status: "Live",
    language: "en",
    last_updated: "2026-07-10",
    url: "/nigeria/ng-salary-tax",
    priority: 100,
  },
  {
    id: "cv-builder",
    name: "CV / Resume Builder",
    description:
      "Africa-ready templates. NYSC/NSS/KCSE aware. Premium templates.",
    category_key: "document-pdf",
    category: "Document & PDF",
    countries: ["ALL"],
    status: "Live",
    language: "en",
    last_updated: "2026-07-10",
    url: "/tools/cv-builder/",
    priority: 97,
  },
  {
    id: "currency-converter",
    name: "AfroFX — Live African Currency Rates",
    description:
      "Live forex rates for 42 African currencies. Historical charts, heatmap, crypto prices, cross-rate matrix, and API access.",
    category_key: "financial",
    category: "Finance, Tax & Market Data",
    countries: ["ALL"],
    status: "Live",
    language: "en",
    last_updated: "2026-07-10",
    url: "/tools/currency-converter/",
    priority: 93,
  },
  {
    id: "salary-compare",
    name: "African Salary Benchmarker",
    description:
      "20 roles across 15 African countries. Salary distribution, total compensation breakdown, skill premiums, PPP-adjusted. AI advisor.",
    category_key: "financial",
    category: "Finance, Tax & Market Data",
    countries: ["ALL"],
    status: "Live",
    language: "en",
    last_updated: "2026-07-10",
    url: "/tools/salary-compare/",
    priority: 90,
  },
  {
    id: "salary-intelligence",
    name: "Salary Intelligence",
    description:
      "Track salary bands by role, city, industry, and experience using benchmark tables and moderated contributor reports.",
    category_key: "financial",
    category: "Finance, Tax & Market Data",
    countries: ["ALL"],
    status: "Live",
    language: "en",
    last_updated: "2026-07-10",
    url: "/tools/salary-intelligence/",
    priority: 89,
  },
  {
    id: "minimum-wage",
    name: "Minimum Wage Checker",
    description:
      "Minimum wage reference for supported African countries. Sector rates, living wage comparison, and historical changes where available.",
    category_key: "financial",
    category: "Finance, Tax & Market Data",
    countries: ["ALL"],
    status: "Live",
    language: "en",
    last_updated: "2026-07-10",
    url: "/tools/minimum-wage/",
    priority: 85,
  },
  {
    id: "overtime-calc",
    name: "Overtime Calculator",
    description:
      "Estimate overtime pay using your country's labour law rates. Review the source date before relying on a multiplier.",
    category_key: "financial",
    category: "Finance, Tax & Market Data",
    countries: ["ALL"],
    status: "Live",
    language: "en",
    last_updated: "2026-07-10",
    url: "/tools/overtime-calc/",
    priority: 84,
  },
  {
    id: "leave-calculator",
    name: "Leave & PTO Calculator",
    description:
      "Leave entitlements for supported African countries. Annual, sick, maternity, paternity leave and public holidays.",
    category_key: "financial",
    category: "Finance, Tax & Market Data",
    countries: ["ALL"],
    status: "Live",
    language: "en",
    last_updated: "2026-07-10",
    url: "/tools/leave-calculator/",
    priority: 83,
  },
  {
    id: "pension-projection",
    name: "Pension Fund Projection",
    description:
      "Project your retirement fund growth for supported African countries. NSSF, SSNIT, RSSB pension planning estimates.",
    category_key: "financial",
    category: "Finance, Tax & Market Data",
    countries: ["ALL"],
    status: "Live",
    language: "en",
    last_updated: "2026-07-10",
    url: "/tools/pension-projection/",
    priority: 81,
  },
  {
    id: "job-offer-evaluator",
    name: "Job Offer Evaluator",
    description:
      "Compare two job offers on salary, benefits, cost of living, and career growth potential.",
    category_key: "financial",
    category: "Finance, Tax & Market Data",
    countries: ["ALL"],
    status: "Live",
    language: "en",
    last_updated: "2026-07-10",
    url: "/tools/job-offer-evaluator/",
    priority: 79,
  },
  {
    id: "interview-prep",
    name: "Interview Preparation Checklist for Africa — By Company Type & Role",
    description:
      "Generate a customised 30-item interview prep checklist. STAR method prompts, role-specific questions, what to wear by country culture, follow-up email template.",
    category_key: "education",
    category: "Education",
    countries: ["ALL"],
    status: "Live",
    language: "en",
    last_updated: "2026-07-10",
    url: "/tools/interview-prep/",
    priority: 50,
  },
  {
    id: "career-switch",
    name: "Career Switch Financial Impact Calculator Africa",
    description:
      "Calculate the true financial cost of switching careers in Africa. Foregone income during retraining, break-even timeline, transition budget, alternative paths analysis.",
    category_key: "career",
    category: "Career & Development",
    countries: ["ALL"],
    status: "Live",
    language: "en",
    last_updated: "2026-07-10",
    url: "/tools/career-switch/",
    priority: 50,
  },
  {
    id: "career-growth",
    name: "Career Growth Trajectory Calculator",
    description:
      "Plot your career growth trajectory. Predict salary milestones, time to promotion, and lifetime earnings across 15 African countries.",
    category_key: "career",
    category: "Career & Development",
    countries: ["ALL"],
    status: "Live",
    language: "en",
    last_updated: "2026-07-10",
    url: "/tools/career-growth/",
    priority: 50,
  },
  {
    id: "salary-negotiation",
    name: "Salary Negotiation Calculator Africa — Market Rates & Counter-Offer",
    description:
      "African salary negotiation calculator. Market rates by country, role, and industry. 25th/50th/75th percentile. Counter-offer range, negotiation script template, total comp calculator.",
    category_key: "career",
    category: "Career & Development",
    countries: ["ALL"],
    status: "Live",
    language: "en",
    last_updated: "2026-07-10",
    url: "/tools/salary-negotiation/",
    priority: 50,
  },
  {
    id: "retirement-readiness",
    name: "Retirement Readiness Score",
    description:
      "Calculate your retirement readiness score. Project savings, check pension adequacy, find your monthly shortfall across 15 African countries.",
    category_key: "career",
    category: "Career & Development",
    countries: ["ALL"],
    status: "Live",
    language: "en",
    last_updated: "2026-07-10",
    url: "/tools/retirement-readiness/",
    priority: 50,
  },
];

export const BUNDLED_AFROTOOLS_CATALOG: AfroToolsCatalogSnapshot = {
  version: 1,
  sourceUrl: "https://afrotools.com/data/tool-directory.json",
  checkedAt: "2026-07-11T06:30:00.000Z",
  catalogLastUpdated: "2026-07-10",
  tools: lkgTools,
};
