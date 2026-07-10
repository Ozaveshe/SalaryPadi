import { expect, test } from "@playwright/test";

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
  await page.getByLabel("Gross cash pay").fill("500000");
  await page.getByRole("button", { name: "Calculate take-home pay" }).click();
  await expect(page.getByText("Estimated result")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: testInfo.outputPath("take-home-result.png"),
    fullPage: true,
  });
});
