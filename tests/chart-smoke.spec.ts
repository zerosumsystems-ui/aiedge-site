import { expect, test } from "@playwright/test"

const baseUrl = process.env.CHART_BASE_URL ?? "http://127.0.0.1:3000"
const chartReadyTimeout = 30_000

test("chart renders with ƒx menu + grouped EMA controls", async ({ page }) => {
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))

  await page.goto(`${baseUrl}/chart`, { waitUntil: "domcontentloaded" })

  // ƒx button anchors the indicator menu — must appear within a few
  // seconds even on slow API paths.
  const indicatorButton = page.getByRole("button", { name: "Indicators" })
  await expect(indicatorButton).toBeVisible({ timeout: chartReadyTimeout })

  await indicatorButton.click()
  const indicatorsMenu = page.getByRole("menu")
  await expect(indicatorsMenu.getByText("EMA overlays", { exact: true })).toBeVisible()
  await expect(indicatorsMenu.getByText("Chart overlays", { exact: true })).toBeVisible()

  // Each row carries a "<label> settings" gear; expanding it surfaces an
  // inline panel. Real settings exist for EMA period, HTF context count,
  // micro gaps + FVG max-active; others show "No options yet."
  await expect(indicatorsMenu.getByRole("button", { name: /^5m EMA\d+ settings$/ })).toBeVisible()
  await expect(indicatorsMenu.getByRole("button", { name: "Micro gaps settings" })).toBeVisible()

  await indicatorsMenu.getByRole("button", { name: "Micro gaps settings" }).click()
  await expect(indicatorsMenu.getByText("Max active zones")).toBeVisible()

  // Canvas paints — at least one visible canvas with non-trivial size.
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
