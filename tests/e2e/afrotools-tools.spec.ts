import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const paths = [
  "/tools",
  "/tools/take-home-pay",
  "/tools/salary-converter",
  "/tools/offer-compare",
  "/tools/job-scam-checker",
] as const;

test.describe("AfroTools career platform surfaces", () => {
  for (const path of paths) {
    test(`${path} has an accessible, mobile-safe main surface`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const violations = await new AxeBuilder({ page })
        .include("main")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        violations.violations.map(({ id, nodes }) => ({
          id,
          targets: nodes.map((node) => node.target),
        })),
      ).toEqual([]);
      const overflow = await page.evaluate(() => {
        const main = document.querySelector("main");
        return main ? main.scrollWidth - main.clientWidth : 0;
      });
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
