import { expect, test, type Page } from "@playwright/test";

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

  /**
   * Waits for the results to settle and reports how many cards arrived.
   *
   * The results stream in behind a Suspense boundary, so counting immediately
   * after `goto` races the stream and reads zero on a page that does have jobs.
   * The env-less browser-journeys run also has no job data at all by design, so
   * the wait has to accept the empty state as a settled outcome rather than
   * demanding a list that will never appear.
   */
  async function countSettledCards(page: Page): Promise<number> {
    await expect(page.locator(".job-list, .empty-state").first()).toBeVisible({
      timeout: 30_000,
    });
    return page.locator(".job-list-item").count();
  }

  test("selects a job into the panel from anywhere on its card, without a request", async ({
    page,
  }) => {
    await page.goto("/jobs");
    const cards = page.locator(".job-list-item");
    const cardCount = await countSettledCards(page);
    test.skip(cardCount < 2, "This run has fewer than two published jobs.");

    const panel = page.locator("#job-quick-view");
    await expect(panel).toBeVisible();

    const target = cards.nth(1);
    const targetTitle = await target.locator(".job-title").innerText();
    expect(await panel.locator("h2").innerText()).not.toBe(targetTitle);

    /*
     * The regression this guards against is selection going back to being a
     * URL change, which made the server rebuild the results — the request it
     * issued carried the `selected` parameter. So that parameter appearing in
     * any request, or any document navigation at all, is the failure.
     *
     * Counting every request to `/jobs` instead would fail on Next's own link
     * prefetching: the cards link to detail routes and the path nav links to
     * `/jobs?eligibility=...`, and Next fetches those on its own schedule
     * whether or not anything is selected. That would assert the framework's
     * behaviour rather than ours.
     */
    const selectionRequests: string[] = [];
    const documentRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).searchParams.has("selected")) {
        selectionRequests.push(request.url());
      }
      if (request.resourceType() === "document") {
        documentRequests.push(request.url());
      }
    });

    // A click on the card body, not on any link inside it.
    await target.locator(".job-facts").first().click();

    await expect(panel.locator("h2")).toHaveText(targetTitle);
    await expect(target).toHaveAttribute("data-selected", "true");
    // Linkable: the selection is in the address bar without a navigation.
    expect(new URL(page.url()).searchParams.get("selected")).not.toBeNull();
    expect(selectionRequests).toEqual([]);
    expect(documentRequests).toEqual([]);
  });

  test("keeps links inside a card working and exposes a keyboard control", async ({
    page,
  }) => {
    await page.goto("/jobs");
    const cards = page.locator(".job-list-item");
    const cardCount = await countSettledCards(page);
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
