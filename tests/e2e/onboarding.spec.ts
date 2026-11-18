import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("first run walks through connecting an AI, then gets out of the way", async ({ page }) => {
  await page.goto("/");
  const guide = page.getByRole("dialog", { name: "Welcome to Matra" });
  await expect(guide.getByRole("heading", { name: "Write clearly, everywhere." })).toBeVisible();
  await guide.getByRole("button", { name: "Get started" }).click();
  await expect(guide.getByRole("heading", { name: "Connect an AI" })).toBeVisible();
  await guide.getByLabel("Google Gemini API key").fill("AIza-test");
  await guide.getByRole("button", { name: "Save", exact: true }).click();
  await expect(guide.getByText("Google Gemini key saved")).toBeVisible();
  await guide.getByRole("button", { name: "Continue" }).click();
  await expect(guide.getByRole("heading", { name: "You're set." })).toBeVisible();
  await guide.getByRole("button", { name: "Start writing" }).click();
  await expect(guide).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Welcome to Matra" })).toHaveCount(0);
});
