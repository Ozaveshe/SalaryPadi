import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  ARTIFACT_DIR,
  assertNotChallenged,
  captureRoute,
  findViolations,
  normalize,
  scanCustomerSurface,
  settle,
  visit,
} from "./support/public-surface";

/**
 * Production acceptance.
 *
 * Unlike the local route audit, this suite NEVER skips a data-dependent
 * assertion: on a real deployment, "no job to audit" is a failure, not a
 * reason to pass quietly. It is intended to run against a deployed target
 * whose commit has already been matched by the workflow.
 *
 * Pinned regression targets are configurable so an expired posting can be
 * replaced without editing the suite:
 *   PRODUCTION_ACCEPTANCE_JOB_SLUG
 *   PRODUCTION_ACCEPTANCE_COMPANY_SLUG
 */

/**
 * An unset workflow input arrives as an empty string, not as undefined, so
 * `??` alone would pin the target to "" and silently audit the listing page
 * at /jobs/ or /companies/ instead of the intended detail page. Blank always
 * means "use the default".
 */
function pinnedSlug(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

/*
 * Repointed 2026-07-28. The previous default (a Zipline warehouse role) had
 * closed, and every Moniepoint and Zipline detail page currently answers
 * "Job unavailable" even where the row is still `published` — tracked
 * separately; it is not something this pin can work around.
 *
 * Chosen because it is a canonical row of ours rather than a feed passthrough,
 * it comes from the employer's own board, and a graduate programme stays open
 * for months rather than weeks. It will still close eventually, and when it
 * does `resolveAuditableJob` audits a live job instead of failing the suite.
 */
const PINNED_JOB = pinnedSlug(
  process.env.PRODUCTION_ACCEPTANCE_JOB_SLUG,
  "graduate-software-engineer-open-source-and-linux-canonical-ubuntu-87dad5b00e6cb94e",
);
/**
 * Whether the job pin was chosen for this run or is the built-in default. A
 * chosen pin that is dead is an operator error; the default going stale is a
 * third-party posting closing, which is not.
 */
const JOB_PIN_IS_EXPLICIT = Boolean(
  process.env.PRODUCTION_ACCEPTANCE_JOB_SLUG?.trim(),
);
const PINNED_COMPANY = pinnedSlug(
  process.env.PRODUCTION_ACCEPTANCE_COMPANY_SLUG,
  "zipline",
);

const REPLACE_TARGET_HINT =
  "Replace the acceptance target: set PRODUCTION_ACCEPTANCE_JOB_SLUG / " +
  "PRODUCTION_ACCEPTANCE_COMPANY_SLUG (workflow inputs) to a live posting.";

test.use({ screenshot: "off", trace: "retain-on-failure", video: "off" });

/** Records the environment the suite actually tested, for the artifact set. */
test.beforeAll(async ({ baseURL }) => {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  let buildInfo: unknown = null;
  try {
    const response = await fetch(
      new URL("/api/build-info", baseURL).toString(),
    );
    if (response.ok) buildInfo = await response.json();
  } catch {
    buildInfo = null;
  }
  writeFileSync(
    resolve(ARTIFACT_DIR, "acceptance-context.json"),
    `${JSON.stringify(
      {
        baseURL,
        testedAt: new Date().toISOString(),
        pinnedJob: PINNED_JOB,
        pinnedCompany: PINNED_COMPANY,
        buildInfo,
      },
      null,
      2,
    )}\n`,
  );
});

async function auditRoute(page: Page, route: string, label = route) {
  await visit(page, route);
  const scan = await scanCustomerSurface(page);
  await captureRoute(page, label, scan, test.info().project.name);
  const violations = findViolations(scan);
  expect(
    violations,
    `${label}: prohibited public language ${JSON.stringify(violations)}`,
  ).toEqual([]);
  return scan;
}

async function firstHref(page: Page, selector: string): Promise<string | null> {
  const link = page.locator(selector).first();
  if ((await link.count()) === 0) return null;
  return link.getAttribute("href");
}

/**
 * A pinned target that has gone stale reaches one of two pages, and both answer
 * with a 200, so neither is caught by a status check:
 *
 * - the feed could not be checked, so the detail page renders the evidence
 *   shell ("This job could not be checked"), or
 * - the feed is live and the role is genuinely gone, so `notFound()` renders
 *   the not-found page ("This page is no longer available.").
 */
async function looksExpired(page: Page): Promise<boolean> {
  return (
    (await page
      .getByRole("heading", {
        name: /could not be checked|unavailable|no longer available/i,
      })
      .count()) > 0
  );
}

/**
 * The job detail the strict product assertions below run against.
 *
 * An explicitly configured pin is a deliberate choice, so a dead one is an
 * operator error and fails with the hint. The built-in default is a different
 * thing: it points at a third-party posting, and those close on their own
 * schedule. A closed posting is the product working — roles are withdrawn once
 * their source stops carrying them — so failing the acceptance suite for it
 * reports fixture rot as a production defect, and a suite that is red for
 * reasons nobody can act on stops being read at all.
 *
 * When the default has closed, the run moves to the first live job in the feed
 * and records which one it used. Not one assertion below is relaxed; only the
 * target changes.
 */
async function resolveAuditableJob(
  page: Page,
): Promise<{ path: string; substituted: boolean }> {
  const pinnedPath = `/jobs/${PINNED_JOB}`;
  const response = await page.goto(pinnedPath, {
    waitUntil: "domcontentloaded",
  });
  // A challenge answers 403, which would otherwise read as "the pinned job has
  // closed" and send the run looking for a replacement posting.
  await assertNotChallenged(page, pinnedPath);
  const reachedPin =
    response?.status() === 200 &&
    new URL(page.url()).pathname.replace(/\/$/, "") === pinnedPath;

  if (reachedPin) {
    await settle(page);
    if (!(await looksExpired(page))) {
      return { path: pinnedPath, substituted: false };
    }
  }

  // An operator chose this slug; tell them it is dead rather than papering
  // over it with a different job.
  expect(
    JOB_PIN_IS_EXPLICIT,
    `Configured pinned job /jobs/${PINNED_JOB} is expired, missing or unavailable. ${REPLACE_TARGET_HINT}`,
  ).toBe(false);

  await visit(page, "/jobs");
  const href = await firstHref(page, ".job-card .job-title a");
  expect(
    href,
    `The default pinned job has closed and /jobs offers no live replacement, so the job detail surface could not be audited at all. ${REPLACE_TARGET_HINT}`,
  ).toBeTruthy();
  return { path: href!, substituted: true };
}

/* ------------------------- static customer routes ---------------------- */

for (const route of [
  "/",
  "/jobs",
  "/companies",
  "/salaries",
  "/insights",
  "/contribute",
  "/for-employers",
]) {
  test(`${route} exposes no internal diagnostics`, async ({ page }) => {
    await auditRoute(page, route);
  });
}

/* ------------------------------ pinned job ----------------------------- */

test("a real job detail is live and customer-ready", async ({ page }) => {
  const target = await resolveAuditableJob(page);
  // Recorded rather than logged silently: a run that audited a substitute
  // should say so in its own output, so a green result is never mistaken for
  // the configured pin still being alive.
  test.info().annotations.push({
    type: "job-target",
    description: target.substituted
      ? `${target.path} (default pin has closed; audited a live job instead)`
      : `${target.path} (pinned)`,
  });

  const scan = await auditRoute(page, target.path, "pinned-job");

  // Product assertions.
  await expect(page.locator(".job-card-title a").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Apply on/i })).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: /Save job/i })
      .or(page.getByRole("link", { name: /Sign in to save/i })),
  ).toBeVisible();
  await expect(
    page.getByText("How SalaryPadi verified this information"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Open original source/i }).first(),
  ).toBeVisible();

  // Absent sections are omitted, never rendered as empty scaffolding.
  for (const heading of ["Requirements", "Benefits"]) {
    const section = page.getByRole("heading", { name: heading, exact: true });
    if ((await section.count()) > 0) {
      await expect(
        page.locator(`section:has(h2:text-is("${heading}")) p`).first(),
      ).not.toBeEmpty();
    }
  }
  // No zero-value company-intelligence rows.
  for (const label of [
    "Approved reviews",
    "Interview experiences",
    "Published benefits",
  ]) {
    const row = page.locator(`dt:text-is("${label}") + dd`);
    if ((await row.count()) > 0) {
      await expect(row.first()).not.toHaveText("0");
    }
  }
  expect(scan.text).not.toContain("not permitted for this source");
});

/* -------------------------- dynamic real job --------------------------- */

test("a dynamically selected real job is auditable", async ({ page }) => {
  await visit(page, "/jobs");
  const href = await firstHref(page, ".job-card .job-title a");
  expect(
    href,
    "/jobs contains no auditable job on the deployed target.",
  ).toBeTruthy();
  await auditRoute(page, href!, "dynamic-job");
  await expect(page.getByRole("link", { name: /Apply on/i })).toBeVisible();
});

/* --------------------------- pinned company ---------------------------- */

test("pinned company profile is live with all six tabs", async ({ page }) => {
  const response = await page.goto(`/companies/${PINNED_COMPANY}`, {
    waitUntil: "domcontentloaded",
  });
  await assertNotChallenged(page, `/companies/${PINNED_COMPANY}`);
  expect(
    response?.status(),
    `Pinned company /companies/${PINNED_COMPANY} did not return 200. ${REPLACE_TARGET_HINT}`,
  ).toBe(200);

  expect(
    new URL(page.url()).pathname.replace(/\/$/, ""),
    `Expected a company profile, landed on ${page.url()}. ${REPLACE_TARGET_HINT}`,
  ).toBe(`/companies/${PINNED_COMPANY}`);
  await settle(page);
  await auditRoute(page, `/companies/${PINNED_COMPANY}`, "pinned-company");

  for (const tab of [
    "Overview",
    "Jobs",
    "Salaries",
    "Reviews",
    "Benefits",
    "Interviews",
  ]) {
    await expect(
      page.getByRole("link", { name: tab, exact: true }).first(),
      `Company tab "${tab}" is missing.`,
    ).toBeVisible();
  }

  // The evidence drawer exists but stays secondary (collapsed by default).
  const drawer = page.locator("details.evidence-details");
  await expect(drawer).toHaveCount(1);

  // Governance actions (correct, appeal, takedown) sit BELOW the candidate
  // decision content and the evidence drawer, never above it.
  const order = await page.evaluate(() => {
    const governance = document.querySelector(
      '[aria-labelledby="company-requests-heading"]',
    );
    const evidence = document.querySelector("details.evidence-details");
    const overview = document.querySelector("main h1, .page-title");
    if (!governance || !evidence || !overview) return null;
    const position = (node: Element) =>
      overview.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING
        ? 1
        : -1;
    return {
      governanceAfterOverview: position(governance) === 1,
      governanceAfterEvidence: Boolean(
        evidence.compareDocumentPosition(governance) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    };
  });
  expect(order, "Company page structure could not be resolved.").not.toBeNull();
  expect(
    order?.governanceAfterOverview,
    "Governance links appear above the company overview.",
  ).toBe(true);
  expect(
    order?.governanceAfterEvidence,
    "Governance links appear above the evidence drawer.",
  ).toBe(true);

  // Demoted, not removed: every correction route stays reachable.
  await expect(
    page.getByRole("link", {
      name: /Report, correct, appeal or request takedown/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Request contribution deletion/i }),
  ).toBeVisible();

  // The employer path leaves the candidate profile.
  await expect(
    page.getByRole("link", { name: /Are you this employer/i }),
  ).toHaveAttribute("href", "/for-employers");

  // Tab routes are themselves auditable.
  await auditRoute(
    page,
    `/companies/${PINNED_COMPANY}/jobs`,
    "pinned-company-jobs",
  );
  await auditRoute(
    page,
    `/companies/${PINNED_COMPANY}/benefits`,
    "pinned-company-benefits",
  );
});

test("a dynamically selected real company is auditable", async ({ page }) => {
  await visit(page, "/companies");
  const href = await firstHref(page, ".company-row h2 a");
  expect(
    href,
    "/companies contains no auditable company on the deployed target.",
  ).toBeTruthy();
  await auditRoute(page, href!, "dynamic-company");
});

/* ------------------------------- salaries ------------------------------ */

test("salary surface keeps its lanes and reference-period wording", async ({
  page,
}) => {
  const hub = await auditRoute(page, "/salaries");
  expect(hub.text).not.toContain("evidence date range");
  expect(hub.text).not.toContain("evidence lane");

  // The three lanes are stable: they render regardless of search state, so the
  // information architecture never changes shape between queries.
  for (const lane of [
    "Local salary evidence",
    "Jobs with disclosed pay",
    "International remote benchmarks",
  ]) {
    await expect(
      page.getByRole("heading", { name: lane, exact: true }),
      `Salary lane "${lane}" is missing.`,
    ).toBeVisible();
  }

  // A role page is part of the customer surface too.
  const roleHref = await firstHref(page, 'a[href^="/salaries/ng/"]');
  expect(roleHref, "/salaries exposes no role page to audit.").toBeTruthy();
  const role = await auditRoute(page, roleHref!, "salary-role");
  expect(role.text).not.toContain("evidence lane");
});

/* ------------------------------- insights ------------------------------ */

test("insights shows the pulse with scope, period and limitations", async ({
  page,
}) => {
  const scan = await auditRoute(page, "/insights");
  await expect(
    page.getByRole("heading", { name: "Job market pulse" }),
    "The Job Market Pulse is expected on the deployed target but is absent.",
  ).toBeVisible();
  for (const marker of ["scope:", "period:", "limitations:"]) {
    expect(
      scan.text,
      `Insights is missing its "${marker}" statement.`,
    ).toContain(marker);
  }

  // Internal feed keys are never customer-facing names.
  for (const key of ["jobicy", "himalayas", "reliefweb", "database"]) {
    expect(
      scan.rawLeaves,
      `Insights rendered the raw source key "${key}".`,
    ).not.toContain(key);
  }
});

/* ------------------- metadata and accessible-name language -------------- */

/**
 * Implementation vocabulary in a meta description reaches search results, and
 * in an aria-label it reaches screen-reader users. Neither is body copy, so
 * neither was scanned before; both are customer-facing.
 */
test("customer-facing metadata carries no implementation language", async ({
  page,
}) => {
  for (const route of ["/", "/jobs", "/salaries", "/insights", "/companies"]) {
    await visit(page, route);
    const scan = await scanCustomerSurface(page);
    const violations = findViolations(scan).filter(
      (violation) => violation.kind === "metadata",
    );
    expect(
      violations,
      `${route}: prohibited language in metadata ${JSON.stringify(violations)}`,
    ).toEqual([]);
    expect(
      scan.metadata.metaDescription,
      `${route} has no meta description to audit.`,
    ).toBeTruthy();
  }
});

test("aria-labels and JSON-LD descriptions use customer language", async ({
  page,
}) => {
  await visit(page, "/insights");
  const scan = await scanCustomerSurface(page);
  const labels = scan.metadata.ariaLabels.map((value) => value.toLowerCase());
  expect(labels).not.toContain("snapshot counts");
  expect(scan.metadata.ariaLabels.length).toBeGreaterThan(0);

  for (const description of scan.metadata.jsonLdDescriptions) {
    expect(normalize(description)).not.toContain("privacy-thresholded");
  }
});

test("opened disclosures are part of the audited surface", async ({ page }) => {
  // A prohibited label inside a collapsed <details> is still shipped. This
  // asserts the scanner really opens them rather than reporting zero.
  await visit(page, `/companies/${PINNED_COMPANY}`);
  const scan = await scanCustomerSurface(page);
  expect(
    scan.disclosuresOpened,
    "No disclosure was opened; collapsed content would go unaudited.",
  ).toBeGreaterThan(0);
  expect(findViolations(scan)).toEqual([]);
});

/* ----------------------------- contribute ------------------------------ */

test("contribute leads with the salary action and demotes employer paths", async ({
  page,
}) => {
  await auditRoute(page, "/contribute");
  await expect(
    page.getByRole("heading", { name: "Share your salary anonymously" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Share a workplace experience" }),
  ).toBeVisible();
  // Employer actions are not peers of the candidate contribution options.
  await expect(
    page.getByRole("heading", { name: "Post a job", exact: true }),
  ).toHaveCount(0);
});

/* --------------------------- accessibility ----------------------------- */

/**
 * Intentional exclusions, documented rather than broadly disabled:
 * - `color-contrast` is excluded ONLY on routes rendering third-party logo
 *   imagery where the contrast algorithm samples the remote image; it stays
 *   enabled everywhere else.
 * No other rule is disabled.
 */
test("critical routes have no serious or critical accessibility violations", async ({
  page,
}, testInfo) => {
  const routes: Array<[string, string[]]> = [
    ["/jobs", []],
    [`/jobs/${PINNED_JOB}`, []],
    [`/companies/${PINNED_COMPANY}`, []],
    ["/salaries", []],
    ["/contribute", []],
  ];
  const findings: Array<Record<string, unknown>> = [];
  for (const [route, disabledRules] of routes) {
    await visit(page, route);
    let builder = new AxeBuilder({ page }).withTags([
      "wcag2a",
      "wcag2aa",
      "wcag21a",
      "wcag21aa",
    ]);
    if (disabledRules.length > 0) builder = builder.disableRules(disabledRules);
    const results = await builder.analyze();
    const serious = results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    );
    findings.push({
      route,
      serious: serious.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.length,
      })),
    });
    expect(
      serious,
      `${route}: serious/critical accessibility violations ${JSON.stringify(
        serious.map((violation) => violation.id),
      )}`,
    ).toEqual([]);
  }
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(
    resolve(ARTIFACT_DIR, `axe-${testInfo.project.name}.json`),
    `${JSON.stringify(findings, null, 2)}\n`,
  );
});
