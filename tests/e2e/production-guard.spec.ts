import { test as playwright } from "@playwright/test";

import { expect, test } from "./support/production-guard";

/**
 * Proves the guard fires. Everything is served by request interception, so
 * this spec needs no dev server and no network — it is a check on the guard
 * itself, not on any deployed surface.
 *
 * A remote-looking baseURL is what arms the guard, so `.test` is used rather
 * than localhost. Nothing resolves it; every request is fulfilled locally.
 */
test.use({ baseURL: "https://salarypadi.test" });

/** The interstitial as Netlify served it on 2026-08-03. */
const CHALLENGE_BODY = `<html><body><div>
<h1>salarypadi.test</h1>
<p>We are verifying your connection. This will only take a few seconds...</p>
<p>Security by <a href="https://www.netlify.com/security/">Netlify</a></p>
<div>Challenge ID: <code>01KZ2QXN8MKAW5YYR090CC977Z</code></div>
</div></body></html>`;

const REAL_BODY = `<html><body><main>
<h1>Zipline</h1><p>Trust &amp; safety. Security by design.</p>
</main></body></html>`;

test("a challenged navigation fails as a challenge, not as a broken route", async ({
  page,
}) => {
  await page.route("**/*", (route) =>
    route.fulfill({
      status: 403,
      contentType: "text/html",
      body: CHALLENGE_BODY,
    }),
  );

  const navigation = page.goto("/companies/zipline");

  await expect(navigation).rejects.toThrow(
    /Edge bot protection challenged this run at \/companies\/zipline/,
  );
  // The reason it exists: the failure must not read as a product defect.
  await expect(navigation).rejects.toThrow(/not a defect on the customer/);
  await expect(navigation).rejects.toThrow(/01KZ2QXN8MKAW5YYR090CC977Z/);
});

test("an ordinary page navigates untouched", async ({ page }) => {
  await page.route("**/*", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: REAL_BODY }),
  );

  // "Security by design" is one marker; one is never enough.
  const response = await page.goto("/companies/zipline");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Zipline" })).toBeVisible();
});

/**
 * The guard must stay inert locally. Uses the unwrapped Playwright fixture so
 * the assertion is about arming, not about the challenge check itself.
 */
playwright.describe("local targets", () => {
  playwright.use({ baseURL: "http://localhost:3000" });

  test("does not arm against a dev server", async ({ page }) => {
    await page.route("**/*", (route) =>
      route.fulfill({
        status: 403,
        contentType: "text/html",
        body: CHALLENGE_BODY,
      }),
    );

    // Same body, same status — but locally this is somebody's mock, not an
    // edge challenge, and the guard must not invent a failure from it.
    const response = await page.goto("/companies/zipline");
    expect(response?.status()).toBe(403);
  });
});
