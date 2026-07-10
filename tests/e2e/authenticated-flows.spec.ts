import { expect, test } from "@playwright/test";

const userStorageState = process.env.E2E_USER_STORAGE_STATE;
const adminStorageState = process.env.E2E_ADMIN_STORAGE_STATE;

test.describe.configure({ mode: "serial" });
test.use({
  storageState: userStorageState ?? { cookies: [], origins: [] },
});

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Authenticated mutation journeys run once; public journeys cover all viewports.",
  );
  test.skip(
    !userStorageState,
    "Set E2E_USER_STORAGE_STATE to an isolated SalaryPadi test-user session.",
  );
});

test("saves a job, tracks an application and reports a safety concern", async ({
  page,
}) => {
  await page.goto("/jobs/remote");
  await page.locator(".job-card .job-title a").first().click();

  await page.getByRole("button", { name: "Save job" }).click();
  await expect(page).toHaveURL(/saved=true/);
  await page.getByRole("button", { name: "I applied" }).click();
  await expect(page).toHaveURL(/\/applications\?created=true/);
  await expect(
    page.getByRole("heading", { name: "Application tracker" }),
  ).toBeVisible();

  await page.goto("/jobs/remote");
  await page.locator(".job-card .job-title a").first().click();
  await page.getByLabel("Report this job").selectOption("fee");
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page).toHaveURL(/reported=true/);
});

test("creates a focused private job alert", async ({ page }) => {
  await page.goto("/alerts");
  await page.getByLabel("Role or skill").fill("product design");
  await page.getByLabel("Location or region").fill("Worldwide");
  await page.getByLabel("Eligibility").selectOption("worldwide");
  await page.getByRole("button", { name: "Create alert" }).click();

  await expect(page).toHaveURL(/created=true/);
  await expect(
    page.getByRole("heading", { name: "Saved alerts" }),
  ).toBeVisible();
});

test("submits salary, review and interview evidence for moderation", async ({
  page,
}) => {
  const unique = Date.now().toString();

  await page.goto("/contribute/salary");
  await page.getByLabel("Role title").fill(`QA Engineer ${unique}`);
  await page.getByLabel("Role family").fill("Engineering");
  await page.getByLabel("Years of experience").fill("4");
  await page.getByLabel("Base salary").fill("750000");
  await page.getByLabel(/information is accurate/i).check();
  await page.getByRole("button", { name: "Submit for moderation" }).click();
  await expect(page).toHaveURL(/\/contribute\?status=submitted/);

  await page.goto("/post-a-job");
  await page.getByLabel("Company name").fill(`SalaryPadi Test ${unique}`);
  await page
    .getByLabel("Corporate email")
    .fill(`careers-${unique}@salarypadi.test`);
  await page.getByLabel("Company website").fill("https://salarypadi.test");
  await page.getByLabel("Job title").fill(`Platform Engineer ${unique}`);
  await page.getByLabel("Location").fill("Lagos or remote within Nigeria");
  await page
    .getByLabel("Description")
    .fill(
      "Build and operate dependable product infrastructure for an Africa-first career intelligence service. This test vacancy contains enough factual detail for the moderation path.",
    );
  await page
    .getByLabel("Requirements")
    .fill("Experience operating TypeScript services and production databases.");
  await page
    .getByLabel("Exact evidence shown to candidates")
    .fill(
      "Applications are explicitly open to candidates resident in Nigeria.",
    );
  await page
    .getByLabel("External application URL")
    .fill("https://salarypadi.test/careers/platform-engineer");
  await page.getByLabel(/authorised to publish/i).check();
  await page.getByRole("button", { name: "Submit for moderation" }).click();
  await expect(page).toHaveURL(/\/post-a-job\?submitted=true/);

  await page.goto("/contribute/review");
  await page.getByLabel("Company").fill(`SalaryPadi Test ${unique}`);
  await page.getByLabel("Role family").fill("Engineering");
  await page
    .getByLabel("What worked well?")
    .fill("Clear written goals and reliable payroll.");
  await page
    .getByLabel("What could be better?")
    .fill("More structured feedback would help.");
  await page.getByLabel(/removed names/i).check();
  await page.getByRole("button", { name: "Submit for moderation" }).click();
  await expect(page).toHaveURL(/\/contribute\?status=submitted/);

  await page.goto("/contribute/interview");
  await page.getByLabel("Company").fill(`SalaryPadi Test ${unique}`);
  await page.getByLabel("Role family").fill("Engineering");
  await page.getByLabel("How did you apply?").fill("Company careers page");
  await page
    .getByLabel("Interview stages")
    .fill("Recruiter call and a structured technical interview.");
  await page
    .getByLabel("General experience")
    .fill("The timeline and evaluation criteria were explained clearly.");
  await page.getByLabel(/not included exact proprietary/i).check();
  await page.getByRole("button", { name: "Submit for moderation" }).click();
  await expect(page).toHaveURL(/\/contribute\?status=submitted/);
});

test("an AAL2 admin can approve queued content with an audit reason", async ({
  browser,
}) => {
  test.skip(
    !adminStorageState,
    "Set E2E_ADMIN_STORAGE_STATE to an isolated AAL2 SalaryPadi admin session.",
  );

  const context = await browser.newContext({ storageState: adminStorageState });
  const page = await context.newPage();
  await page.goto("/admin/moderation");
  await expect(
    page.getByRole("heading", { name: "Moderation queue" }),
  ).toBeVisible();

  const firstRow = page.locator(".admin-table tbody tr").first();
  await expect(firstRow).toBeVisible();
  await firstRow.getByLabel(/Action for/).selectOption("approve");
  await firstRow.getByLabel("Reason").fill("E2E approval after safety review");
  await firstRow.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/updated=true/);
  await page.goto("/admin/jobs");
  await expect(page.getByText(/Platform Engineer/).first()).toBeVisible();
  await context.close();
});
