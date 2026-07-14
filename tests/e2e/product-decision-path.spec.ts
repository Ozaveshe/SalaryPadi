import { expect, test } from "@playwright/test";

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

test.describe("continuous job decision path", () => {
  test("starts with one dominant eligibility-aware search", async ({
    page,
  }) => {
    await page.goto("/");
    const search = page.getByRole("search", { name: "Search jobs" });
    await search.getByLabel("Role, skill or company").fill("data analyst");
    await search.getByLabel("Open to").selectOption("africa");
    await search.getByRole("button", { name: /Search jobs/ }).click();

    await expect(page).toHaveURL(/q=data\+analyst/);
    await expect(page).toHaveURL(/eligibility=africa/);
    await expect(page.getByLabel("Can apply from")).toHaveValue("africa");
  });

  test("keeps Africa-specific filters in the URL and saved-search handoff", async ({
    page,
  }) => {
    await page.goto("/jobs?path=remote_africa");
    await page.getByText("More filters", { exact: true }).click();
    await page.getByLabel("HND explicitly accepted").check();
    await page.getByLabel("HMO / health cover mentioned").check();
    await page.getByLabel("FX policy mentioned").check();
    await page.getByRole("button", { name: "Apply filters" }).click();

    await expect(page).toHaveURL(/path=remote_africa/);
    await expect(page).toHaveURL(/hndAccepted=on/);
    await expect(page).toHaveURL(/hmo=on/);
    await expect(page).toHaveURL(/fxPolicy=on/);
    await page.getByRole("link", { name: "Save this search" }).click();
    await expect(page).toHaveURL(/\/auth\/sign-in\?next=/);
    expect(decodeURIComponent(page.url())).toContain("hndAccepted=true");
    expect(decodeURIComponent(page.url())).toContain("fxPolicy=true");
  });

  test("separates in-product tool experiences from external destinations", async ({
    page,
  }) => {
    await page.goto("/tools");
    await expect(page.getByText("Use inside SalaryPadi · 2")).toBeVisible();
    await expect(page.getByText("Continue on AfroTools · 13")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Use in SalaryPadi" }),
    ).toHaveCount(2);
    await expect(
      page.getByRole("link", { name: /Continue on AfroTools/ }),
    ).toHaveCount(13);
    await expect(
      page.getByText(
        /synchronized cache|integration type|catalog timestamp|widget/i,
      ),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Check warning signs" }),
    ).toHaveAttribute("href", "/tools/job-scam-checker");
  });

  test("keeps contribution and employer paths discoverable while demoting empty community areas", async ({
    page,
  }) => {
    await page.goto("/contribute");
    for (const name of [
      "Post a job",
      "Claim company",
      "Request a right of reply",
      "Add salary",
      "Add review",
      "Add interview experience",
    ]) {
      await expect(
        page.getByRole("main").getByText(name, { exact: true }).first(),
      ).toBeVisible();
    }

    const primary = page.getByRole("navigation", {
      name: "Primary navigation",
    });
    if (await primary.isVisible()) {
      await expect(primary.getByRole("link", { name: "Feed" })).toHaveCount(0);
      await expect(primary.getByRole("link", { name: "Forums" })).toHaveCount(
        0,
      );
    }
  });
});
