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
        name: "Compare pay without exposing a person",
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
});
