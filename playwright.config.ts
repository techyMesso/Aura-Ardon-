import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: {
    timeout: 10_000
  },
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(browserChannel ? { channel: browserChannel } : {}),
        viewport: { width: 1280, height: 800 }
      }
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 5"],
        ...(browserChannel ? { channel: browserChannel } : {}),
        viewport: { width: 390, height: 844 }
      }
    }
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npx next start -H 127.0.0.1 -p ${port}`,
        url: `${baseURL}/robots.txt`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000
      }
});

