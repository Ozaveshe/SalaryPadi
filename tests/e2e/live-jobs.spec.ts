import { expect, test } from "@playwright/test";

test.describe("production job source canary", () => {
  test.skip(
    process.env.REQUIRE_LIVE_SOURCE !== "true",
    "This canary runs only against the explicitly configured production URL.",
  );

  test("proves worker health, publication, attribution and destination", async ({
    page,
    request,
  }) => {
    const healthResponse = await request.get("/api/health");
    expect(healthResponse.status()).toBe(200);
    const health = (await healthResponse.json()) as {
      status?: unknown;
      checks?: {
        workers?: Array<{
          task_key?: unknown;
          freshness?: unknown;
          last_status?: unknown;
          last_started_at?: unknown;
          last_success_at?: unknown;
        }>;
      };
    };
    expect(health.status).toBe("ok");
    expect(health.checks?.workers).toContainEqual(
      expect.objectContaining({
        task_key: "job_source_sync",
        freshness: "healthy",
      }),
    );
    const sourceWorker = health.checks?.workers?.find(
      (worker) => worker.task_key === "job_source_sync",
    );
    expect(["succeeded", "skipped"]).toContain(sourceWorker?.last_status);
    expect(typeof sourceWorker?.last_started_at).toBe("string");
    const sourceRunAgeMs =
      Date.now() - Date.parse(String(sourceWorker?.last_started_at));
    expect(sourceRunAgeMs).toBeGreaterThanOrEqual(0);
    expect(sourceRunAgeMs).toBeLessThanOrEqual(14 * 60 * 60 * 1_000);

    await page.goto("/jobs");
    const remotiveCard = page
      .locator(".job-card")
      .filter({ hasText: "Source: Remotive" })
      .first();
    if (sourceWorker?.last_status === "skipped") {
      await expect(remotiveCard).toHaveCount(0);
      await expect(page.getByLabel("Can apply from")).toBeVisible();
      return;
    }

    expect(typeof sourceWorker?.last_success_at).toBe("string");
    const sourceSuccessAgeMs =
      Date.now() - Date.parse(String(sourceWorker?.last_success_at));
    expect(sourceSuccessAgeMs).toBeGreaterThanOrEqual(0);
    expect(sourceSuccessAgeMs).toBeLessThanOrEqual(14 * 60 * 60 * 1_000);
    await expect(remotiveCard).toBeVisible();
    const detailLink = remotiveCard.locator(".job-title a");
    const href = await detailLink.getAttribute("href");
    expect(href).toMatch(/^\/jobs\/[a-z0-9-]+$/);
    const jobId = await remotiveCard.getAttribute("data-job-id");
    expect(jobId).toMatch(/^remotive-\d+$/);

    const stableDetailPath = `/jobs/${encodeURIComponent(jobId!)}`;
    await page.goto(stableDetailPath);
    await expect(page).toHaveURL(new RegExp(`${stableDetailPath}$`));
    await expect(page.getByText("Source and freshness")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/i,
    );
    const structuredData = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    expect(structuredData.join("\n")).not.toContain('"JobPosting"');
    const sourceLink = page.getByRole("link", { name: /Open original source/ });
    await expect(sourceLink).toHaveAttribute("href", /^https:\/\//);
    await expect(sourceLink).toHaveAttribute("rel", /nofollow/);

    await page.goto("/jobs?eligibility=nigeria");
    await expect(page.getByLabel("Can apply from")).toHaveValue("nigeria");
    await expect(
      page.getByRole("heading", { name: "Current results" }),
    ).toBeVisible();
  });
});
