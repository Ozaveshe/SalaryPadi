import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  ARTIFACT_DIR,
  captureRoute,
  findViolations,
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

const PINNED_JOB =
  process.env.PRODUCTION_ACCEPTANCE_JOB_SLUG ??
  "warehouse-operations-excellence-lead-africa-754b93ae3f815241";
const PINNED_COMPANY =
  process.env.PRODUCTION_ACCEPTANCE_COMPANY_SLUG ?? "zipline";

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

test("pinned job detail is live and customer-ready", async ({ page }) => {
  const response = await page.goto(`/jobs/${PINNED_JOB}`, {
    waitUntil: "domcontentloaded",
  });
  expect(
    response?.status(),
    `Pinned job /jobs/${PINNED_JOB} did not return 200. ${REPLACE_TARGET_HINT}`,
  ).toBe(200);
  await settle(page);
  // An expired posting renders the "unavailable" shell with a 200; treat that
  // as an expired pin, not a pass.
  await expect(
    page.getByRole("heading", { name: /could not be checked|unavailable/i }),
    `Pinned job appears expired or unavailable. ${REPLACE_TARGET_HINT}`,
  ).toHaveCount(0);

  const scan = await auditRoute(page, `/jobs/${PINNED_JOB}`, "pinned-job");

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
  expect(
    response?.status(),
    `Pinned company /companies/${PINNED_COMPANY} did not return 200. ${REPLACE_TARGET_HINT}`,
  ).toBe(200);

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
