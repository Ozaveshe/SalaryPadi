import { expect, test } from "@playwright/test";

const requireLiveAfroTools = process.env.REQUIRE_LIVE_AFROTOOLS === "true";

test.use({ screenshot: "off", trace: "off", video: "off" });

async function expectNoHorizontalOverflow(
  page: import("@playwright/test").Page,
) {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

test("captures responsive home and completed calculator surfaces", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("homepage.png"),
    fullPage: true,
  });

  await page.goto("/tools/take-home-pay");
  await page.getByLabel("Salary amount").fill("500000");
  await page
    .getByRole("checkbox", {
      name: /Send this amount to the AfroTools PAYE API/,
    })
    .check();
  await page.getByRole("button", { name: "Calculate" }).click();
  const verifiedEstimate = page.getByRole("heading", {
    name: "Verified estimate",
  });
  const provenance = page.getByRole("link", { name: "API provenance" });
  if (requireLiveAfroTools) {
    await expect(verifiedEstimate).toBeVisible();
    await expect(provenance).toBeVisible();
  } else {
    await expect(
      page.getByRole("alert").filter({
        hasText:
          "AfroTools PAYE is temporarily unavailable. No result was produced.",
      }),
    ).toHaveText(
      "AfroTools PAYE is temporarily unavailable. No result was produced.",
    );
    await expect(verifiedEstimate).toHaveCount(0);
    await expect(provenance).toHaveCount(0);
  }
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: testInfo.outputPath(
      requireLiveAfroTools
        ? "take-home-result-redacted.png"
        : "take-home-fail-closed.png",
    ),
    fullPage: true,
    mask: [page.getByLabel("Salary amount"), page.locator(".data-list dd")],
  });
});
