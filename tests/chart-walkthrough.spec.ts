import { expect, test } from "@playwright/test"

const baseUrl = process.env.CHART_BASE_URL ?? "https://www.aiedge.trade"

test.use({
  video: "on",
  viewport: { width: 1280, height: 800 },
  ignoreHTTPSErrors: true,
})

test("chart walkthrough", async ({ page }) => {
  await page.goto(`${baseUrl}/chart`, { waitUntil: "domcontentloaded" })

  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(2_000)

  await page.getByRole("button", { name: "1H", exact: true }).click()
  await page.waitForTimeout(1_500)

  await page.getByRole("button", { name: "15m", exact: true }).click()
  await page.waitForTimeout(1_500)

  await page.getByRole("button", { name: "5m", exact: true }).click()
  await page.waitForTimeout(1_500)

  await page.getByRole("button", { name: "Indicators" }).click()
  await page.waitForTimeout(2_000)

  await page.keyboard.press("Escape")
  await page.waitForTimeout(1_500)
})
