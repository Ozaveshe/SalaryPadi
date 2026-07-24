import { expect, test, type Page } from "@playwright/test";

import {
  captureRoute,
  findViolations,
  scanCustomerSurface,
  visit,
} from "./support/public-surface";

/**
 * Route-level public-truth audit for local and CI runs. Uses the same
 * prohibited-term list and the same disclosure-opening scanner as the
 * production acceptance suite; the difference is that this suite may skip a
 * data-dependent route when the target has no data (CI runs env-less).
 */

test.use({ screenshot: "off", trace: "off", video: "off" });

async function auditRoute(page: Page, route: string, label = route) {
  await visit(page, route);
  const scan = await scanCustomerSurface(page);
  await captureRoute(page, label, scan);
  expect(findViolations(scan), `${label}: prohibited public language`).toEqual(
    [],
  );
  return scan;
}

async function firstSlug(page: Page, selector: string, prefix: string) {
  const link = page.locator(selector).first();
  if ((await link.count()) === 0) return null;
  const href = await link.getAttribute("href");
  return href ? href.replace(prefix, "") : null;
}

test.describe("route-level public truth", () => {
  // One test per route: each gets its own timeout budget, and dev-mode
  // first-compile latency on a heavy route cannot starve the others.
  for (const route of [
    "/",
    "/jobs",
    "/companies",
    "/salaries",
    "/contribute",
    "/for-employers",
  ]) {
    test(`${route} never exposes null-state or diagnostic language`, async ({
      page,
    }) => {
      await auditRoute(page, route);
    });
  }

  test("insights renders the Job Market Pulse without diagnostics", async ({
    page,
  }) => {
    await visit(page, "/insights");
    // The pulse is computed from the live snapshot; on a data-backed target
    // it must be visible, but an env-less build honestly renders no pulse.
    // Production acceptance asserts its presence unconditionally.
    const pulse = page.getByRole("heading", { name: "Job market pulse" });
    if ((await pulse.count()) > 0) await expect(pulse).toBeVisible();
    const scan = await scanCustomerSurface(page);
    await captureRoute(page, "/insights", scan);
    expect(findViolations(scan), "/insights").toEqual([]);
  });

  test("a real job detail leads with the trust summary and no diagnostics", async ({
    page,
  }) => {
    await visit(page, "/jobs");
    const slug = await firstSlug(page, ".job-card .job-title a", "/jobs/");
    test.skip(!slug, "No live job available to audit on this base URL.");

    await auditRoute(page, `/jobs/${slug}`, `job-${slug}`);

    await expect(
      page.getByText("How SalaryPadi verified this information"),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Apply on/i })).toBeVisible();
    await expect(
      page
        .getByRole("button", { name: /Save job/i })
        .or(page.getByRole("link", { name: /Sign in to save/i })),
    ).toBeVisible();

    // Requirements / Benefits headings only when the section has content.
    for (const heading of ["Requirements", "Benefits"]) {
      const section = page.getByRole("heading", { name: heading, exact: true });
      if ((await section.count()) > 0) {
        await expect(
          page.locator(`section:has(h2:text-is("${heading}")) p`).first(),
        ).not.toBeEmpty();
      }
    }
  });

  test("a real company profile omits absent fields", async ({ page }) => {
    await visit(page, "/companies");
    const slug = await firstSlug(page, ".company-row h2 a", "/companies/");
    test.skip(!slug, "No company available to audit on this base URL.");
    await auditRoute(page, `/companies/${slug}`, `company-${slug}`);
  });
});
