import { expect, test } from "@playwright/test";

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

async function expectNoHorizontalOverflow(
  page: import("@playwright/test").Page,
) {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

async function expectResponsiveNavigation(
  page: import("@playwright/test").Page,
) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("A fixed viewport is required.");

  if (viewport.width >= 1152) {
    await expect(
      page.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^(Open|Close) navigation$/ }),
    ).toHaveCount(0);
    return;
  }

  const trigger = page.getByRole("button", {
    name: /^(Open|Close) navigation$/,
  });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Tools", exact: true })
    .click();
  await expect(page).toHaveURL(/\/tools$/);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
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
  await expectResponsiveNavigation(page);

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

test("keeps audited public surface shells responsive", async ({ page }) => {
  for (const route of [
    "/jobs",
    "/companies",
    "/salaries",
    "/insights",
    "/tools",
  ]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("captures the public decision path at each configured viewport", async ({
  page,
}, testInfo) => {
  for (const [name, route] of [
    ["home", "/"],
    ["jobs", "/jobs"],
    ["companies", "/companies"],
    ["salaries", "/salaries"],
    ["tools", "/tools"],
    ["contribute", "/contribute"],
  ] as const) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`${name}-surface.png`),
      fullPage: true,
    });
  }
});

test("keeps the core path usable at the 320px lower bound", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "The explicit 320px lower-bound pass only needs one browser project.",
  );
  await page.setViewportSize({ width: 320, height: 800 });
  for (const [name, route] of [
    ["home", "/"],
    ["jobs", "/jobs"],
    ["tools", "/tools"],
  ] as const) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`${name}-320.png`),
      fullPage: true,
    });
  }
});
