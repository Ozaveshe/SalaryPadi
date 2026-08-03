import {
  expect,
  test as base,
  type APIResponse,
  type Page,
} from "@playwright/test";

import {
  assertNotChallenged,
  isRemoteTarget,
  looksLikeEdgeChallenge,
} from "./public-surface";

/**
 * Arms edge-challenge detection for specs that run against a deployed target.
 *
 * The acceptance suite guards its navigations explicitly, but the live-smoke
 * specs drive `page.goto` directly, so every route they visit was a place a
 * challenge could still masquerade as a product defect — and a spec added
 * tomorrow would inherit that gap. Guarding at the fixture means new
 * navigations are covered by default rather than by remembering.
 *
 * The guard arms itself only when the target is remote. Local runs against the
 * dev server behave exactly as before: no extra evaluation, no new failure
 * mode, nothing for a developer to opt out of.
 */

export { isRemoteTarget };

/**
 * `page.goto` is wrapped rather than watched via an event listener because a
 * listener cannot fail the test at the navigation that caused the problem —
 * it would surface later, detached from the route that was blocked.
 */
export const test = base.extend({
  // The second argument is positional, so it is named `runTest` rather than
  // Playwright's customary `use`: the react-hooks lint rule reads a call to a
  // bare `use()` as a React hook in a non-component function and errors.
  page: async ({ page, baseURL }, runTest) => {
    if (isRemoteTarget(baseURL)) {
      const navigate = page.goto.bind(page);
      page.goto = async (
        url: string,
        options?: Parameters<Page["goto"]>[1],
      ) => {
        const response = await navigate(url, options);
        await assertNotChallenged(page, url);
        return response;
      };
    }
    await runTest(page);
  },
});

/**
 * The API-request equivalent, for the health and JSON calls a live smoke test
 * makes without a page. Kept explicit at the call site: unlike navigation,
 * these are few, and reading the body of every response to check for a
 * challenge would be wasteful.
 *
 * Only a 403 is inspected, so the normal path never touches the body.
 */
export async function assertResponseNotChallenged(
  response: APIResponse,
  label: string,
): Promise<void> {
  if (response.status() !== 403) return;
  const body = await response.text().catch(() => "");
  if (!looksLikeEdgeChallenge(body)) return;
  throw new Error(
    `Edge bot protection challenged this run at ${label}, so production was ` +
      `NOT verified. This is the test client being blocked at the edge, not a ` +
      `defect on the customer surface — do not treat it as a failed release.`,
  );
}

export { expect };
