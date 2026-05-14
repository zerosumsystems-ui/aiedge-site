import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    // Sandboxed runners (Claude Code web sessions, some CI envs) don't trust
    // the public CA chain Chrome uses, so smoke runs against prod fail at
    // the TLS handshake. Smoke testing is end-to-end, not a security check.
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], ignoreHTTPSErrors: true },
    },
  ],
})
