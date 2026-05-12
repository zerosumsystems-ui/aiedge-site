import { expect, test } from "@playwright/test"

const baseUrl = process.env.CHART_BASE_URL ?? "http://127.0.0.1:3000"
const chartReadyTimeout = 30_000

test("chart renders with grouped EMA controls", async ({ page }) => {
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))

  await page.goto(`${baseUrl}/chart`, { waitUntil: "domcontentloaded" })

  const indicatorButton = page.getByRole("button", { name: "Indicators" })
  await expect(indicatorButton).toBeVisible()

  const emaGroup = page.getByLabel("EMA overlays").first()
  await expect(emaGroup).toBeVisible({ timeout: chartReadyTimeout })
  await expect(emaGroup).toContainText("EMA", { timeout: chartReadyTimeout })
  await expect(emaGroup).toContainText("5m", { timeout: chartReadyTimeout })

  await indicatorButton.click()
  const indicatorsMenu = page.getByRole("menu")
  await expect(indicatorsMenu.getByText("EMA overlays", { exact: true })).toBeVisible()
  await expect(indicatorsMenu.getByRole("button", { name: "5m EMA20 On" })).toBeVisible()

  await expect(page.locator("canvas").first()).toBeVisible({ timeout: chartReadyTimeout })
  const hasPaintedChart = await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll("canvas"))
    return canvases.some((canvas) => {
      if (canvas.width < 200 || canvas.height < 100) return false
      const context = canvas.getContext("2d", { willReadFrequently: true })
      if (!context) return false

      const width = Math.min(canvas.width, 240)
      const height = Math.min(canvas.height, 160)
      const x = Math.max(0, Math.floor((canvas.width - width) / 2))
      const y = Math.max(0, Math.floor((canvas.height - height) / 2))
      const pixels = context.getImageData(x, y, width, height).data
      const colors = new Set<string>()

      for (let i = 0; i < pixels.length; i += 64) {
        const alpha = pixels[i + 3]
        if (alpha === 0) continue
        colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]},${alpha}`)
        if (colors.size > 8) return true
      }
      return false
    })
  })
  expect(hasPaintedChart).toBe(true)
  expect(pageErrors).toEqual([])
})
