import { defineConfig, devices } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

// 🔒 Auto-rileva se il file di auth esiste
const authFile = path.join(process.cwd(), ".playwright-auth.json");
const hasAuth = fs.existsSync(authFile);

/**
 * Playwright E2E configuration for LabelPulse.
 * Tests run against the production URL (no local server needed).
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  timeout: 60000,
  expect: {
    timeout: 15000,
  },
  use: {
    baseURL: "https://my-project-ivory-nine.vercel.app",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "it-IT",
    viewport: { width: 1280, height: 720 },
    // 🔒 Usa storageState se il file esiste (login salvato)
    storageState: hasAuth ? authFile : undefined,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
