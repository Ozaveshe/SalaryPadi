import { expect, test, type Locator } from "@playwright/test";

async function expectOneHonestState({
  data,
  empty,
  unavailable,
}: {
  data: Locator;
  empty: Locator;
  unavailable: Locator;
}) {
  const states = await Promise.all([
    data.count(),
    empty.count(),
    unavailable.count(),
  ]);
  const visibleStates = states.filter((count) => count > 0).length;
  expect(
    visibleStates,
    "The page must render data, a confirmed empty state, or an unavailable state—but never conflate them.",
  ).toBe(1);
}

test.describe("repository-backed public states", () => {
  test("company directory distinguishes data, empty, and unavailable", async ({
    page,
  }) => {
    await page.goto("/companies");
    await expect(
      page.getByRole("heading", { name: "Know more before you accept" }),
    ).toBeVisible();
    await expectOneHonestState({
      data: page.locator(".company-list"),
      empty: page.getByRole("heading", {
        name: "No source-listed companies available",
      }),
      unavailable: page
        .getByRole("status")
        .filter({ hasText: /Company records|Backend connection needed/ }),
    });
  });

  test("salary search does not present an outage as no matching data", async ({
    page,
  }) => {
    await page.goto("/salaries?role=unlikely-role-sentinel&country=NG");
    await expect(
      page.getByRole("heading", {
        name: "Compare pay with the evidence attached",
      }),
    ).toBeVisible();
    await expectOneHonestState({
      data: page.locator(".aggregate-grid"),
      empty: page.getByRole("heading", {
        name: "No safe aggregate matches yet",
      }),
      unavailable: page
        .getByRole("status")
        .filter({ hasText: /Salary aggregates|Backend connection needed/ }),
    });
  });

  test("editorial index keeps fallback failures distinct from an empty feed", async ({
    page,
  }) => {
    await page.goto("/insights");
    await expect(
      page.getByRole("heading", { name: "Job data briefs" }),
    ).toBeVisible();
    await expectOneHonestState({
      data: page.locator(".card-grid"),
      empty: page.getByRole("heading", {
        name: "No verified brief is published yet",
      }),
      unavailable: page
        .getByRole("status")
        .filter({ hasText: /Editorial briefs|Backend connection needed/ }),
    });
  });

  test("community feed does not present an unavailable backend as no posts", async ({
    page,
  }) => {
    await page.goto("/feed");
    await expect(
      page.getByRole("heading", {
        name: "What people are learning, asking and sharing",
      }),
    ).toBeVisible();
    await expectOneHonestState({
      data: page.locator(".community-list"),
      empty: page.getByRole("heading", { name: "No posts match yet" }),
      unavailable: page
        .getByRole("status")
        .filter({ hasText: /Community posts|Backend connection needed/ }),
    });
  });

  test("forums do not present an unavailable backend as no discussions", async ({
    page,
  }) => {
    await page.goto("/forums");
    await expect(
      page.getByRole("heading", {
        name: "Discuss the parts of work that need context",
      }),
    ).toBeVisible();
    await expectOneHonestState({
      data: page.locator(".community-list"),
      empty: page.getByRole("heading", { name: "No discussions here yet" }),
      unavailable: page
        .getByRole("status")
        .filter({ hasText: /Forum discussions|Backend connection needed/ }),
    });
  });

  test("job detail distinguishes a confirmed miss from an inconclusive source read", async ({
    page,
  }) => {
    const response = await page.goto(
      "/jobs/definitely-not-a-real-salarypadi-job-sentinel",
    );
    const confirmedMissing = response?.status() === 404;
    const unavailableHeading = page.getByRole("heading", {
      name: "This job could not be checked",
    });

    await expect
      .poll(
        async () =>
          Number(confirmedMissing) +
          Number((await unavailableHeading.count()) > 0),
      )
      .toBe(1);
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
      "content",
      /noindex/,
    );
    if ((await unavailableHeading.count()) > 0) {
      await expect(page.getByRole("status")).toBeVisible();
      await expect(
        page.getByText(/not being presented as a confirmed missing job/i),
      ).toBeVisible();
    }
  });

  test("editorial detail stays noindex when absence cannot be confirmed", async ({
    page,
  }) => {
    const response = await page.goto(
      "/insights/definitely-not-a-real-editorial-brief-sentinel",
    );
    const confirmedMissingHeading = page.getByRole("heading", {
      name: "This page is no longer available.",
    });
    const unavailableHeading = page.getByRole("heading", {
      name: "This brief could not be checked",
    });

    await expect
      .poll(async () => {
        const confirmedMissing =
          response?.status() === 404 ||
          (await confirmedMissingHeading.count()) > 0;
        return (
          Number(confirmedMissing) +
          Number((await unavailableHeading.count()) > 0)
        );
      })
      .toBe(1);
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
      "content",
      /noindex/,
    );
  });

  test("job search does not publish a zero total for an inconclusive feed", async ({
    page,
  }) => {
    await page.goto("/jobs");
    const sourceNotice = page
      .getByRole("status")
      .filter({ hasText: /job results|reviewed source/i });
    const count = page.locator(".results-count").first();

    await expect(count).toContainText(
      /Unavailable|available \(partial\)|\d+ (?:job|jobs)/,
    );
    const countText = await count.textContent();

    if (/Unavailable|available \(partial\)/.test(countText ?? "")) {
      await expect(sourceNotice).toHaveCount(1);
      await expect(
        page.getByRole("heading", {
          name: "No current jobs have passed the publication checks",
        }),
      ).toHaveCount(0);
    } else {
      await expect(count).toContainText(/\d+ (?:job|jobs)/);
    }
  });

  test("the evergreen guide suppresses a false empty state during source failure", async ({
    page,
  }) => {
    await page.goto("/guides/remote-jobs-open-to-nigerians");
    const sourceNotice = page
      .getByRole("status")
      .filter({ hasText: /job results|reviewed source/i });

    if ((await sourceNotice.count()) > 0) {
      await expect(
        page.getByRole("heading", {
          name: "No indexable roles meet the evidence gate right now",
        }),
      ).toHaveCount(0);
    }
  });
});
