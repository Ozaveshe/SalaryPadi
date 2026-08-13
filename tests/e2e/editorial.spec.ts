import { expect, test } from "@playwright/test";

// The app server always runs with NEXT_PUBLIC_APP_URL set to the base URL
// under test (playwright.config.ts webServer env), so emitted canonical,
// feed and sitemap origins must match the base URL — not the ambient
// NEXT_PUBLIC_APP_URL of the test process, which CI sets differently.
const expectedOrigin =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

test("publishes the evergreen guide with live data and valid Article metadata", async ({
  page,
}) => {
  await page.goto("/guides/remote-jobs-open-to-nigerians");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Remote jobs open to Nigerians",
    }),
  ).toBeVisible();
  await expect(page.getByText("Dynamic live-job block")).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${expectedOrigin}/guides/remote-jobs-open-to-nigerians`,
  );
  const schemas = (
    await page.locator('script[type="application/ld+json"]').allTextContents()
  ).map((value) => JSON.parse(value) as Record<string, unknown>);
  expect(schemas.some((schema) => schema["@type"] === "Article")).toBe(true);
  expect(schemas.some((schema) => schema["@type"] === "JobPosting")).toBe(
    false,
  );
});

test("renders a sourced growth guide with crawlable metadata and useful next steps", async ({
  page,
}) => {
  const path = "/guides/how-to-write-cv-for-jobs-nigeria";
  const response = await page.goto(path);

  expect(response?.ok()).toBe(true);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "How to write a CV for jobs in Nigeria",
    }),
  ).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${expectedOrigin}${path}`,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /index, follow/u,
  );
  await expect(
    page.getByRole("heading", { level: 2, name: "Sources and review policy" }),
  ).toBeVisible();

  const externalSources = page.locator(
    'section[aria-labelledby="sources-heading"] a[href^="https://"]',
  );
  await expect(externalSources).toHaveCount(3);
  for (const source of await externalSources.all()) {
    await expect(source).toHaveAttribute("target", "_blank");
    await expect(source).toHaveAttribute("rel", "noopener noreferrer nofollow");
  }

  await expect(
    page
      .getByRole("navigation", { name: "Related SalaryPadi resources" })
      .getByRole("link"),
  ).toHaveCount(4);

  const schemas = (
    await page.locator('script[type="application/ld+json"]').allTextContents()
  ).map((value) => JSON.parse(value) as Record<string, unknown>);
  expect(schemas.find((schema) => schema["@type"] === "Article")).toMatchObject(
    {
      url: `${expectedOrigin}${path}`,
      image: `${expectedOrigin}${path}/opengraph-image`,
      inLanguage: "en-NG",
      isAccessibleForFree: true,
      citation: expect.arrayContaining([
        "https://researchrepository.ilo.org/esploro/outputs/encyclopediaEntry/How-to-organize-my-job-search/995218611202676",
      ]),
    },
  );
});

test("exposes editorial RSS, sitemap and robots discovery", async ({
  request,
}) => {
  const [feed, sitemap, guideSitemap, robots] = await Promise.all([
    request.get("/feed.xml"),
    request.get("/sitemap.xml"),
    request.get("/sitemaps/guides.xml"),
    request.get("/robots.txt"),
  ]);
  expect(feed.ok()).toBe(true);
  expect(feed.headers()["content-type"]).toContain("application/rss+xml");
  expect(await feed.text()).toContain(
    `${expectedOrigin}/guides/remote-jobs-open-to-nigerians`,
  );
  expect(await feed.text()).toContain(
    `${expectedOrigin}/guides/how-to-write-cv-for-jobs-nigeria`,
  );
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain(
    `${expectedOrigin}/sitemaps/guides.xml`,
  );
  expect(guideSitemap.ok()).toBe(true);
  expect(await guideSitemap.text()).toContain(
    `${expectedOrigin}/guides/remote-jobs-open-to-nigerians`,
  );
  expect(await guideSitemap.text()).toContain(
    `${expectedOrigin}/guides/how-to-write-cv-for-jobs-nigeria`,
  );
  expect(robots.ok()).toBe(true);
  const robotsText = await robots.text();
  expect(robotsText).toContain("Allow: /guides/");
  expect(robotsText).toContain("Allow: /insights/");
});
