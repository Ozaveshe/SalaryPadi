import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

interface CrawlFixture {
  htmlRoutes: Array<{
    path: string;
    canonicalPath: string;
    robots: "index" | "noindex" | "gate";
  }>;
  xmlRoutes: string[];
}

const fixture = JSON.parse(
  readFileSync(resolve("tests/fixtures/crawl/seo-routes.json"), "utf8"),
) as CrawlFixture;
const expectedOrigin = (
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://127.0.0.1:3100"
).replace(/\/$/, "");

test.describe("crawl contract", () => {
  for (const route of fixture.htmlRoutes) {
    test(`${route.path} renders canonical HTML`, async ({ page }) => {
      const response = await page.goto(route.path, {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);

      const canonical = page.locator('link[rel="canonical"]');
      const expectedCanonical =
        route.canonicalPath === "/"
          ? expectedOrigin
          : new URL(route.canonicalPath, expectedOrigin).toString();
      await expect(canonical).toHaveAttribute("href", expectedCanonical);
      await expect(page.locator("h1")).toHaveCount(1);

      const robotsElement = page.locator('meta[name="robots"]');
      const robots =
        (await robotsElement.count()) > 0
          ? await robotsElement.getAttribute("content")
          : null;
      if (route.robots === "noindex") expect(robots).toContain("noindex");
      if (route.robots === "index")
        expect(robots ?? "index").not.toContain("noindex");

      const jobPostingCount = await page
        .locator('script[type="application/ld+json"]')
        .evaluateAll(
          (scripts) =>
            scripts.filter((script) =>
              script.textContent?.includes('"JobPosting"'),
            ).length,
        );
      expect(jobPostingCount).toBe(0);
    });
  }

  test("sitemap index exposes the six child inventories", async ({
    request,
  }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/xml");
    expect(response.headers()["x-salarypadi-sitemap-state"]).toMatch(
      /^(?:ready|degraded)$/,
    );
    const body = await response.text();
    for (const route of fixture.xmlRoutes.slice(1))
      expect(body).toContain(route);
  });

  for (const route of fixture.xmlRoutes.slice(1)) {
    test(`${route} returns a valid URL set`, async ({ request }) => {
      const response = await request.get(route);
      const state = response.headers()["x-salarypadi-sitemap-state"];
      expect(state).toMatch(/^(?:ready|degraded|unavailable)$/);
      expect(response.status()).toBe(state === "unavailable" ? 503 : 200);
      expect(response.headers()["content-type"]).toContain("application/xml");
      expect(await response.text()).toContain("<urlset");
    });
  }

  test("the cornerstone guide has Article and BreadcrumbList data", async ({
    page,
  }) => {
    await page.goto("/guides/remote-jobs-open-to-nigerians");
    const jsonLd = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    expect(jsonLd.some((value) => value.includes('"@type":"Article"'))).toBe(
      true,
    );
    expect(
      jsonLd.some((value) => value.includes('"@type":"BreadcrumbList"')),
    ).toBe(true);
  });

  test("unknown role and city variants are 404 instead of thin pages", async ({
    request,
  }) => {
    for (const path of [
      "/jobs/roles/unreviewed-role",
      "/jobs/cities/unreviewed-city",
    ]) {
      expect((await request.get(path)).status()).toBe(404);
    }
  });

  test("filter and pagination variants stay noindex with one directory canonical", async ({
    page,
  }) => {
    await page.goto("/jobs?q=engineering&sort=newest&page=2");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/jobs$/,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });
});
