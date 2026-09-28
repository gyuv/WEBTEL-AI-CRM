import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("dashboard loads with demo data in mock mode", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText("Mock mode")).toBeVisible();
  await expect(page.getByText("Call these first")).toBeVisible();
});

test("discover → leads from a natural-language query", async ({ page }) => {
  await page.goto("/discover");
  await page.getByLabel("Lead search input").fill("CA firms in T Nagar");
  await expect(page.getByText("Natural-language search")).toBeVisible();
  await page.getByRole("button", { name: "Find leads" }).click();
  await page.waitForURL(/\/leads\?search=/, { timeout: 60_000 });
  await expect(page.getByText(/\d+ leads? from this search/)).toBeVisible();
});

test("lead page: pain points cite sources and assets generate", async ({ page }) => {
  await page.goto("/leads");
  await page.locator("div.cursor-pointer a[href^='/leads/']").first().click();
  await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);
  await page.getByRole("tab", { name: /Pain points/ }).click();
  await expect(page.getByText("What to pitch")).toBeVisible();
  await page.getByRole("tab", { name: /Scripts/ }).click();
  const gen = page.getByRole("button", { name: /Generate|Regenerate/ });
  await gen.click();
  await expect(page.getByText("Cold email — 3 A/B variants")).toBeVisible();
  await expect(page.getByText(/Deliverability \d+/).first()).toBeVisible();
});

test("call desk logs an outcome and advances", async ({ page }) => {
  await page.goto("/calls");
  const first = await page.locator("h1, a.text-lg").first().textContent();
  await page.getByRole("button", { name: /Interested/ }).first().click();
  await expect(page.getByText(/Logged: interested/)).toBeVisible();
  await expect(page.locator("a.text-lg").first()).not.toHaveText(first ?? "");
});

test("inbox: pasted reply is classified", async ({ page }) => {
  await page.goto("/inbox");
  await page.getByPlaceholder("Paste the reply text…").fill("Sounds good, please share the pricing and brochure.");
  await page.getByRole("button", { name: /Analyze reply/ }).click();
  await expect(page.getByText(/Classified: Interested/)).toBeVisible();
});

test("products: create a product", async ({ page }) => {
  await page.goto("/products/new");
  await page.locator("input").first().fill("Test Product E2E");
  await page.getByRole("button", { name: "Save product" }).click();
  await page.waitForURL(/\/products\/[0-9a-f-]{36}$/);
  await page.goto("/products");
  await expect(page.getByText("Test Product E2E")).toBeVisible();
});

test("pipeline and settings render", async ({ page }) => {
  await page.goto("/pipeline");
  await expect(page.getByText("Drag cards to change status")).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("tab", { name: "Usage" }).click();
  await expect(page.getByText("Free-tier usage today")).toBeVisible();
});
