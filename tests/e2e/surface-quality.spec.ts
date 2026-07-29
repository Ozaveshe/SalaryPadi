import { expect, test, type Page } from "@playwright/test";

import {
  captureRoute,
  findViolations,
  scanCustomerSurface,
  visit,
} from "./support/public-surface";

/**
 * Guards the "evidence console" regressions: duplicated content between a
 * company overview and its tabs, lanes that vanish depending on search state,
 * raw internal source keys, and repeated empty states.
 */

test.use({ screenshot: "off", trace: "off", video: "off" });

async function firstSlug(page: Page, selector: string, prefix: string) {
  const link = page.locator(selector).first();
  if ((await link.count()) === 0) return null;
  const href = await link.getAttribute("href");
  return href ? href.replace(prefix, "") : null;
}

/** Counts non-overlapping occurrences of a phrase in the visible surface. */
function occurrences(text: string, phrase: string): number {
  return text.split(phrase).length - 1;
}

test.describe("company overview does not duplicate its tabs", () => {
  test("overview previews jobs and summarises lanes without full tab content", async ({
    page,
  }) => {
    await visit(page, "/companies");
    const slug = await firstSlug(page, ".company-row h2 a", "/companies/");
    test.skip(!slug, "No company available on this base URL.");

    await visit(page, `/companies/${slug}`);
    const scan = await scanCustomerSurface(page);
    await captureRoute(page, `company-overview-${slug}`, scan);
    expect(findViolations(scan)).toEqual([]);

    // The overview keeps a bounded jobs preview, never the full list.
    const previewJobs = await page.locator(".job-card").count();
    expect(previewJobs).toBeLessThanOrEqual(3);

    // Full tab content does not appear on the overview.
    await expect(
      page.getByRole("heading", { name: "Interview experiences" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Published benefits evidence" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Community evidence" }),
    ).toHaveCount(0);

    // The renamed section no longer calls open jobs a community report.
    await expect(
      page.getByRole("heading", {
        name: "What people report about working here",
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Explore this company" }),
    ).toBeVisible();

    // No repeated boilerplate empty state.
    expect(occurrences(scan.text, "nothing published yet")).toBe(0);
    expect(occurrences(scan.text, "salarypadi does not estimate this")).toBe(0);
  });

  test("all six tabs remain reachable", async ({ page }) => {
    await visit(page, "/companies");
    const slug = await firstSlug(page, ".company-row h2 a", "/companies/");
    test.skip(!slug, "No company available on this base URL.");
    await visit(page, `/companies/${slug}`);
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
      ).toBeVisible();
    }
  });
});

test.describe("salary lanes are stable", () => {
  const lanes = [
    "Local salary evidence",
    "Jobs with disclosed pay",
    "International remote benchmarks",
  ];

  test("all three lanes are present with no search", async ({ page }) => {
    await visit(page, "/salaries");
    for (const lane of lanes) {
      await expect(
        page.getByRole("heading", { name: lane, exact: true }),
        `Lane "${lane}" missing without a search.`,
      ).toBeVisible();
    }
    // The default view must not dump the benchmark catalogue.
    expect(await page.locator(".salary-evidence-card").count()).toBeLessThan(6);
  });

  test("all three lanes survive a role search", async ({ page }) => {
    await visit(page, "/salaries?role=engineer");
    for (const lane of lanes) {
      await expect(
        page.getByRole("heading", { name: lane, exact: true }),
        `Lane "${lane}" disappeared after a role search.`,
      ).toBeVisible();
    }
    const scan = await scanCustomerSurface(page);
    await captureRoute(page, "salaries-role-search", scan);
    expect(findViolations(scan)).toEqual([]);
    // Still no catalogue dump on a search.
    expect(await page.locator(".salary-evidence-card").count()).toBeLessThan(
      12,
    );
  });
});

test("insights never shows raw internal source keys", async ({ page }) => {
  await visit(page, "/insights");
  const scan = await scanCustomerSurface(page);
  await captureRoute(page, "insights-grouped", scan);
  expect(findViolations(scan)).toEqual([]);

  // Raw feed keys must not appear as standalone customer-facing labels.
  // The check is case-SENSITIVE on the rendered text: "Jobicy" is the
  // source's published brand name (attribution requires it), whereas
  // "jobicy" would be the internal feed key leaking through.
  for (const key of ["database", "jobicy", "himalayas", "reliefweb"]) {
    expect(
      scan.rawLeaves.includes(key),
      `Insights exposed the raw source key "${key}".`,
    ).toBe(false);
  }
  // The database lane must be described, never shown as "database".
  if (scan.text.includes("source coverage")) {
    expect(scan.text).toContain(
      "verified employer and approved source records",
    );
  }

  const pulse = page.getByRole("heading", { name: "Job market pulse" });
  if ((await pulse.count()) > 0) {
    await expect(
      page.getByRole("heading", { name: /Market size within/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Hiring patterns" }),
    ).toBeVisible();
  }
});

test("mobile layout stays usable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const route of ["/companies", "/salaries", "/insights"]) {
    await visit(page, route);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(
      overflow,
      `${route} overflows horizontally on mobile`,
    ).toBeLessThanOrEqual(2);
  }
});

/**
 * The job list is set as an index of records rather than a deck of cards: no
 * container per row, and provenance in its own right-hand column so the source
 * of twenty roles reads as a column you can scan.
 *
 * That column is carried entirely by CSS grid placement, so it can collapse
 * silently — a stray `display` change on the card, or the footer losing
 * `display: contents`, drops the rail back inline under the body and nothing
 * throws. This asserts the geometry rather than the declarations, so it stays
 * true however the rule is expressed.
 */
test("job rows keep provenance in its own column on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await visit(page, "/jobs");

  const card = page.locator(".job-card").first();
  test.skip((await card.count()) === 0, "No jobs published on this base URL.");

  const box = await card.evaluate((el) => {
    const rect = (node: Element | null) =>
      node ? node.getBoundingClientRect() : null;
    const title = rect(el.querySelector(".job-card-title"));
    const rail = rect(el.querySelector(".job-source-badges"));
    return {
      titleRight: title ? title.right : null,
      railLeft: rail ? rail.left : null,
      railTop: rail ? rail.top : null,
      titleTop: title ? title.top : null,
      cardBorder: getComputedStyle(el).borderTopWidth,
    };
  });

  expect(box.railLeft, "the card renders a provenance rail").not.toBeNull();
  expect(
    box.railLeft!,
    "provenance sits beside the role, not beneath it",
  ).toBeGreaterThan(box.titleRight!);
  expect(
    Math.abs(box.railTop! - box.titleTop!),
    "provenance aligns with the first row so the column scans straight",
  ).toBeLessThan(24);
  expect(box.cardBorder, "rows are separated by rules, not boxed").toBe("0px");
});

test("job rows fold provenance underneath on a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await visit(page, "/jobs");

  const card = page.locator(".job-card").first();
  test.skip((await card.count()) === 0, "No jobs published on this base URL.");

  const stacked = await card.evaluate((el) => {
    const title = el.querySelector(".job-card-title")?.getBoundingClientRect();
    const rail = el
      .querySelector(".job-source-badges")
      ?.getBoundingClientRect();
    if (!title || !rail) return null;
    return rail.top > title.top;
  });

  expect(stacked, "the two-column rail cannot survive 360px").toBe(true);

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(
    overflow,
    "/jobs overflows horizontally on mobile",
  ).toBeLessThanOrEqual(2);
});
