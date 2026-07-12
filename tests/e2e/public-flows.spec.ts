import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const requireLiveAfroTools = process.env.REQUIRE_LIVE_AFROTOOLS === "true";

test.use({ screenshot: "off", trace: "off", video: "off" });

test.beforeEach(async ({ context, baseURL }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required.");
  await context.addCookies([
    {
      name: "salarypadi_analytics_v2",
      value: "denied",
      url: baseURL,
      sameSite: "Lax",
    },
  ]);
});

async function firstLiveJob(page: Page) {
  const firstJob = page.locator(".job-card .job-title a").first();
  if ((await firstJob.count()) === 0) {
    if (process.env.REQUIRE_LIVE_SOURCE === "true") {
      await expect(
        firstJob,
        "The required Remotive live-source smoke found no eligible job.",
      ).toBeVisible();
    }

    await expect(
      page
        .getByText(
          /Live jobs are temporarily unavailable|No matching jobs right now/,
        )
        .first(),
    ).toBeVisible();
    test.skip(
      true,
      "The external job source is unavailable or currently empty.",
    );
  }
  return firstJob;
}

test.describe("public MVP journeys", () => {
  test("searches and filters the live, source-attributed jobs feed", async ({
    page,
  }) => {
    await page.goto("/jobs");

    await expect(page.getByRole("search")).toBeVisible();
    await page.getByLabel("Role, skill or keyword").fill("engineer");
    await page.getByLabel("Can apply from").selectOption("nigeria");
    await page.getByRole("button", { name: "Search jobs" }).click();

    await expect(page).toHaveURL(/q=engineer/);
    await expect(page).toHaveURL(/eligibility=nigeria/);
    await expect(page.getByLabel("Can apply from")).toHaveValue("nigeria");
  });

  test("opens a real job, exposes its truth card and starts external apply", async ({
    context,
    page,
  }) => {
    await page.goto("/jobs/remote");
    const firstJob = await firstLiveJob(page);

    await expect(firstJob).toBeVisible();
    await firstJob.click();
    await expect(
      page.getByRole("heading", { name: "Can I apply?" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "What is it worth?" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Can I trust it?" }),
    ).toBeVisible();
    await expect(page.getByText(/Source and freshness/)).toBeVisible();

    const apply = page.getByRole("link", { name: /^Apply on / });
    await expect(apply).toHaveAttribute("rel", /nofollow/);
    const [externalPage] = await Promise.all([
      context.waitForEvent("page"),
      apply.click(),
    ]);
    await expect.poll(() => externalPage.url()).not.toBe("about:blank");
    expect(new URL(externalPage.url()).protocol).toBe("https:");
    await externalPage.close();
  });

  test("gates private save behavior behind authentication", async ({
    page,
  }) => {
    await page.goto("/jobs/remote");
    await (await firstLiveJob(page)).click();
    await page.getByRole("link", { name: "Sign in to save" }).click();

    await expect(page).toHaveURL(/\/auth\/sign-in\?next=/);
    await expect(
      page.getByRole("heading", { name: "Keep your career plan in one place" }),
    ).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
  });

  test.describe("privacy-sensitive tool journeys", () => {
    test("verifies PAYE live or fails closed without credentials", async ({
      page,
    }) => {
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
        await expect(page.getByText("Net monthly")).toBeVisible();
        await expect(page.getByText(/Rules year/)).toBeVisible();
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
    });

    test("completes offer comparison without inventing an FX rate", async ({
      page,
    }) => {
      await page.goto("/tools/offer-compare");
      await page.getByLabel("Base pay").nth(0).fill("500000");
      await page.getByLabel("Base pay").nth(1).fill("600000");
      if (!requireLiveAfroTools) {
        await page.locator("#b_currency").fill("NGN");
      }
      await page
        .getByRole("checkbox", {
          name: /Allow SalaryPadi to request the required currency pairs/,
        })
        .check();
      await page.getByRole("button", { name: "Compare offers" }).click();

      await expect(page.getByText("Normalized comparison")).toBeVisible();
      await expect(
        page.getByText("Practical negotiation points"),
      ).toBeVisible();
      await expect(
        page.getByText(/No market salary claim is generated/),
      ).toBeVisible();
      if (requireLiveAfroTools) {
        await expect(page.getByText("AfroTools FX evidence")).toBeVisible();
      }
    });

    test("completes the local-only scam warning check", async ({ page }) => {
      await page.goto("/tools/job-scam-checker");
      await page
        .getByLabel("Paste the vacancy or recruiter message")
        .fill(
          "Urgent: pay a training fee in cryptocurrency today and send your banking password to receive an instant offer.",
        );
      await page.getByLabel("A payment or fee was requested").check();
      await page
        .getByRole("checkbox", {
          name: /I understand the entered vacancy text/,
        })
        .check();
      await page.getByRole("button", { name: "Check warning signs" }).click();

      await expect(page.getByText("Automated screening result")).toBeVisible();
      await expect(page.getByText("Individual warning flags")).toBeVisible();
      await expect(page.getByText("URL fetch performed:")).toContainText("No");
    });
  });
});

test.describe("launch-quality public surfaces", () => {
  test("records an explicit analytics choice before continuing", async ({
    context,
    page,
  }) => {
    await context.clearCookies();
    await page.goto("/tools");
    const dialog = page.getByRole("dialog", { name: "Optional analytics" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "No thanks" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Analytics choices" }),
    ).toBeVisible();
  });

  for (const path of ["/", "/jobs", "/tools"] as const) {
    test(`${path} has no automatically detectable WCAG A/AA violations`, async ({
      page,
    }) => {
      await page.goto(path);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();

      expect(
        result.violations.map(({ id, nodes }) => ({
          id,
          targets: nodes.map((node) => node.target),
        })),
      ).toEqual([]);
    });
  }

  test("structured data is parseable and source-restricted jobs omit JobPosting", async ({
    page,
  }) => {
    await page.goto("/");
    const homeSchemas = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    expect(homeSchemas.length).toBeGreaterThan(0);
    const parsedHomeSchemas = homeSchemas.map((schema) => JSON.parse(schema));
    expect(
      parsedHomeSchemas.some((schema) => schema["@type"] === "Organization"),
    ).toBe(true);

    await page.goto("/jobs/remote");
    const jobHref = await (await firstLiveJob(page)).getAttribute("href");
    expect(jobHref).toMatch(/^\/jobs\/(?!remote$)/);
    await page.goto(jobHref!);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const jobSchemas = (
      await page.locator('script[type="application/ld+json"]').allTextContents()
    ).map((schema) => JSON.parse(schema));
    expect(
      jobSchemas.some((schema) => schema["@type"] === "BreadcrumbList"),
    ).toBe(true);
    expect(jobSchemas.some((schema) => schema["@type"] === "JobPosting")).toBe(
      false,
    );
  });
});
