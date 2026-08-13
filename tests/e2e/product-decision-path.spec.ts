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
    await expect(page.getByLabel("Can apply from")).toHaveValue("africa", {
      timeout: 15_000,
    });
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
    const saveSearch = page.getByRole("link", { name: "Save this search" });
    await expect(saveSearch).toHaveAttribute(
      "href",
      /\/alerts\?.*hndAccepted=true.*hmo=true.*fxPolicy=true/,
    );
    await Promise.all([
      page.waitForURL(/\/auth\/sign-in\?next=/, { timeout: 20_000 }),
      saveSearch.click(),
    ]);
    expect(decodeURIComponent(page.url())).toContain("hndAccepted=true");
    expect(decodeURIComponent(page.url())).toContain("fxPolicy=true");
  });

  test("organizes career moments with truthful local and external handoffs", async ({
    page,
  }) => {
    await page.goto("/tools");
    const reviewedCatalog = page.getByRole("status").filter({
      hasText:
        /The reviewed tool list is available|Using the last-known reviewed catalog|Using the reviewed bundled fallback catalog/,
    });
    const unavailableCatalog = page.getByRole("alert").filter({
      hasText: "Career tools are temporarily unavailable.",
    });
    expect(
      Number((await reviewedCatalog.count()) > 0) +
        Number((await unavailableCatalog.count()) > 0),
      "The catalog must be reviewed or fail closed when every reviewed snapshot has expired.",
    ).toBe(1);

    const handoffs = page.getByRole("region", {
      name: "Know where the next step happens",
    });
    const localDisclosures = page
      .locator(".status")
      .filter({ hasText: /^Runs in SalaryPadi$/ });
    const externalDisclosures = page
      .locator(".status")
      .filter({ hasText: /^Opens AfroTools$/ });
    const localCount = await localDisclosures.count();
    const externalCount = await externalDisclosures.count();

    await expect(handoffs).toContainText(`Runs in SalaryPadi · ${localCount}`);
    await expect(handoffs).toContainText(`Opens AfroTools · ${externalCount}`);
    expect(localCount).toBeGreaterThanOrEqual(1);

    if ((await reviewedCatalog.count()) > 0) {
      expect(externalCount).toBeGreaterThan(0);
      await expect(
        page.getByRole("link", { name: "Use in SalaryPadi" }),
      ).toHaveCount(localCount - 1);
      const externalLinks = page.getByRole("link", {
        name: /Open on AfroTools/,
      });
      await expect(externalLinks).toHaveCount(externalCount);
      for (const link of await externalLinks.all()) {
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", /nofollow/);
      }
      for (const moment of [
        "Prepare and check the opportunity",
        "Work out what the money means",
        "Compare and negotiate the offer",
        "Plan beyond this role",
      ]) {
        await expect(page.getByRole("heading", { name: moment })).toBeVisible();
      }
    } else {
      await expect(unavailableCatalog).toBeVisible();
      expect(localCount).toBe(5);
      expect(externalCount).toBe(0);
      await expect(
        page.getByRole("link", { name: "Use in SalaryPadi" }),
      ).toHaveCount(4);
      await expect(
        page.getByRole("link", { name: /Open on AfroTools/ }),
      ).toHaveCount(0);
    }
    await expect(
      page.getByText(
        /synchronized cache|integration type|catalog timestamp|widget/i,
      ),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Check warning signs" }),
    ).toHaveAttribute("href", "/tools/job-scam-checker");
  });

  for (const journey of [
    {
      path: "/tools/take-home-pay",
      links: [
        ["Compare the full offer", "/tools/offer-compare"],
        ["Check salary evidence", "/salaries"],
        ["Update your tracker", "/applications"],
      ],
    },
    {
      path: "/tools/salary-converter",
      links: [
        ["Compare two offers", "/tools/offer-compare"],
        ["Estimate Nigeria take-home", "/tools/take-home-pay"],
        ["Check salary evidence", "/salaries"],
      ],
    },
    {
      path: "/tools/offer-compare",
      links: [
        ["Record what happens next", "/applications"],
        ["Check salary evidence", "/salaries"],
        ["Contribute salary evidence", "/contribute/salary"],
      ],
    },
    {
      path: "/tools/job-scam-checker",
      links: [
        ["Search source-attributed roles", "/jobs"],
        ["Review the safety process", "/trust-and-safety"],
        ["Check employer evidence", "/companies"],
      ],
    },
  ] as const) {
    test(`connects ${journey.path} to useful next decisions`, async ({
      page,
    }) => {
      await page.goto(journey.path);
      const nextSteps = page.getByRole("region", {
        name: "Continue the decision",
      });
      await expect(nextSteps).toBeVisible();
      for (const [name, href] of journey.links) {
        await expect(nextSteps.getByRole("link", { name })).toHaveAttribute(
          "href",
          href,
        );
      }
    });
  }

  test("keeps contribution and employer paths discoverable while demoting empty community areas", async ({
    page,
  }) => {
    // Candidate contribution leads with one primary action; the workplace
    // lane then selects its shape. Employer paths live on /for-employers.
    await page.goto("/contribute");
    await expect(
      page.getByRole("heading", {
        name: "Share your salary anonymously",
        exact: true,
      }),
    ).toBeVisible();
    for (const name of ["Review", "Benefits", "Pay reliability", "Interview"]) {
      await expect(
        page.getByRole("main").getByText(name, { exact: true }).first(),
      ).toBeVisible();
    }

    await page.goto("/for-employers");
    for (const name of [
      "Post a job",
      "Claim your company",
      "Request a right of reply",
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
