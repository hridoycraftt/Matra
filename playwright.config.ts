import { defineConfig, devices } from "@playwright/test";

// Chromium runs everywhere. WebKit (the engine inside the real Mac app) runs on the macOS CI runner.
const webkit = process.env.E2E_WEBKIT === "1";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:4173", trace: "off" },
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: webkit
    ? [{ name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 820 } } }]
    : [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 820 } } }],
});
