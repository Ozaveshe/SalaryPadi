import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * Route-level public-truth acceptance. Runs against whatever
 * PLAYWRIGHT_BASE_URL targets — the local build in CI, or production /
 * deploy-preview when set. It is deliberately NOT scoped to the presentation
 * components: it drives the real rendered pages and asserts the customer
 * interface never exposes internal null-state labels or diagnostic
 * machinery. Evidence (HTML + screenshots) is written to
 * output/acceptance/ for every visited route.
 */

test.use({ screenshot: "off", trace: "off", video: "off" });

const ARTIFACT_DIR = resolve(process.cwd(), "output/acceptance");

/** Diagnostic / implementation phrases that must never reach the customer. */
const PROHIBITED_PHRASES = [
  "Job Truth Card",
  "Not permitted for this source",
  "JobPosting permitted and published",
  "Structured data",
  "does not provide requirements as a separate structured field",
  "does not provide benefits as a separate structured field",
  "bounded to 10 per page",
  "interleaved before pagination",
  "Result balance:",
  "Deterministic coverage",
  "Coverage complete",
  "Checks applied",
  "Evidence lane",
  "Parser confidence",
  "Extraction confidence",
  "Moderation state",
] as const;

/** Pure null-state labels: illegal only as a standalone visible value. */
const PROHIBITED_LABELS = [
  "Unknown",
  "Unclear",
  "Not stated",
  "Not provided by the source",
  "None applied",
  "N/A",
  "null",
] as const;

/**
 * `networkidle` is unreliable here — analytics beacons and streamed Suspense
 * boundaries keep the network busy. Wait for the document and the primary
 * shell, then let hydration settle.
 */
async function visit(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.locator("main, .site-shell").first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(600);
}

interface RouteScan {
  innerText: string;
  html: string;
  leafTexts: string[];
}

async function scan(page: Page): Promise<RouteScan> {
  return page.evaluate(() => {
    const leaves: string[] = [];
    for (const element of Array.from(document.querySelectorAll("body *"))) {
      if (element.children.length > 0) continue;
      const text = (element.textContent ?? "").trim();
      if (text) leaves.push(text);
    }
    return {
      innerText: document.body.innerText,
      html: document.documentElement.outerHTML,
      leafTexts: leaves,
    };
  });
}

function assertClean(routeLabel: string, result: RouteScan) {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const safe = routeLabel.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
  writeFileSync(resolve(ARTIFACT_DIR, `${safe}.html`), result.html);

  for (const phrase of PROHIBITED_PHRASES) {
    expect(
      result.innerText.includes(phrase),
      `${routeLabel}: prohibited phrase "${phrase}" is visible`,
    ).toBe(false);
  }
  for (const label of PROHIBITED_LABELS) {
    expect(
      result.leafTexts.includes(label),
      `${routeLabel}: null-state label "${label}" leaked as a standalone value`,
    ).toBe(false);
  }
}

async function saveScreenshot(page: Page, routeLabel: string) {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const safe = routeLabel.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
  await page.screenshot({
    path: resolve(ARTIFACT_DIR, `${safe}.png`),
    fullPage: true,
  });
}

// `count()` resolves immediately, so an env-less target with no live data
// skips fast instead of burning the test's timeout on a getAttribute wait.
async function firstJobSlug(page: Page): Promise<string | null> {
  const link = page.locator(".job-card .job-title a").first();
  if ((await link.count()) === 0) return null;
  const href = await link.getAttribute("href");
  return href ? href.replace(/^\/jobs\//, "") : null;
}

async function firstCompanySlug(page: Page): Promise<string | null> {
  const link = page.locator(".company-row h2 a").first();
  if ((await link.count()) === 0) return null;
  const href = await link.getAttribute("href");
  return href ? href.replace(/^\/companies\//, "") : null;
}

test.describe("route-level public truth", () => {
  // One test per route: each gets its own timeout budget, and dev-mode
  // first-compile latency on a heavy route cannot starve the others.
  for (const route of ["/jobs", "/companies", "/salaries", "/contribute"]) {
    test(`${route} never exposes null-state or diagnostic language`, async ({
      page,
    }) => {
      await visit(page, route);
      const result = await scan(page);
      await saveScreenshot(page, route);
      assertClean(route, result);
    });
  }

  test("insights renders the Job Market Pulse without diagnostics", async ({
    page,
  }) => {
    await visit(page, "/insights");
    // The pulse is computed from the live snapshot; on a data-backed target
    // it must be visible, but an env-less build honestly renders no pulse.
    const pulse = page.getByRole("heading", { name: "Job market pulse" });
    if ((await pulse.count()) > 0) {
      await expect(pulse).toBeVisible();
    }
    const result = await scan(page);
    await saveScreenshot(page, "/insights");
    assertClean("/insights", result);
  });

  test("a real job detail leads with the trust summary and no diagnostics", async ({
    page,
  }) => {
    await visit(page, "/jobs");
    const slug = await firstJobSlug(page);
    test.skip(!slug, "No live job available to audit on this base URL.");

    await visit(page, `/jobs/${slug}`);
    const result = await scan(page);
    await saveScreenshot(page, `job-${slug}`);
    assertClean(`/jobs/${slug}`, result);

    // Trust summary present; Apply and Save reachable.
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
        const body = page
          .locator(`section:has(h2:text-is("${heading}")) p`)
          .first();
        await expect(body).not.toBeEmpty();
      }
    }
  });

  test("a real company profile omits absent fields", async ({ page }) => {
    await visit(page, "/companies");
    const slug = await firstCompanySlug(page);
    test.skip(!slug, "No company available to audit on this base URL.");

    await visit(page, `/companies/${slug}`);
    const result = await scan(page);
    await saveScreenshot(page, `company-${slug}`);
    assertClean(`/companies/${slug}`, result);
  });
});
