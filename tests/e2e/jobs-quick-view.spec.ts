import { expect, test } from "@playwright/test";

/**
 * The quick-view panel on the two-column jobs route.
 *
 * Selecting a job used to be a URL change, so every quick view re-ran the
 * results server component and reassembled the live feed from every reviewed
 * source before anything repainted. These journeys pin the replacement: the
 * whole card is the target, the switch is local, and no request is made.
 */
test.describe("jobs quick view", () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < 1024,
    "The quick-view column only exists at the two-column width.",
  );

  test("selects a job into the panel from anywhere on its card, without a request", async ({
    page,
  }) => {
    await page.goto("/jobs");
    const cards = page.locator(".job-list-item");
    await expect(page.locator(".job-list")).toBeVisible();
    const cardCount = await cards.count();
    // The env-less browser-journeys run has no job data by design.
    test.skip(cardCount < 2, "This run has fewer than two published jobs.");

    const panel = page.locator("#job-quick-view");
    await expect(panel).toBeVisible();

    const target = cards.nth(1);
    const targetTitle = await target.locator(".job-title").innerText();
    expect(await panel.locator("h2").innerText()).not.toBe(targetTitle);

    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));

    // A click on the card body, not on any link inside it.
    await target.locator(".job-facts").first().click();

    await expect(panel.locator("h2")).toHaveText(targetTitle);
    await expect(target).toHaveAttribute("data-selected", "true");
    // Linkable: the selection is in the address bar without a navigation.
    expect(new URL(page.url()).searchParams.get("selected")).not.toBeNull();
    expect(
      requests.filter((url) => new URL(url).pathname.startsWith("/jobs")),
    ).toEqual([]);
  });

  test("keeps links inside a card working and exposes a keyboard control", async ({
    page,
  }) => {
    await page.goto("/jobs");
    const cards = page.locator(".job-list-item");
    const cardCount = await cards.count();
    test.skip(cardCount < 2, "This run has fewer than two published jobs.");

    // The quick-view control is a real button, so the selection is reachable
    // without a pointer.
    const target = cards.nth(1);
    const targetTitle = await target.locator(".job-title").innerText();
    await target.getByRole("button", { name: "Quick view" }).press("Enter");
    await expect(page.locator("#job-quick-view h2")).toHaveText(targetTitle);

    // A link inside the card still navigates rather than selecting.
    await cards
      .nth(0)
      .getByRole("link", { name: "View role and apply" })
      .click();
    await expect(page).toHaveURL(/\/jobs\/[^/]+$/, { timeout: 30_000 });
  });
});
