import { defineConfig, devices } from "@playwright/test";

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://crm_e2e:crm_e2e@localhost:5434/crm_e2e";
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Permet d'utiliser un Chromium système (CI/sandbox) au lieu du
        // navigateur téléchargé par Playwright.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  // Mode local : Playwright démarre l'app buildée contre la base e2e.
  // Mode Docker (E2E_NO_SERVER=1) : la stack tourne déjà via compose.
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: "npm run start -- --port 3100",
        url: `${baseURL}/api/health`,
        reuseExistingServer: false,
        timeout: 90_000,
        env: {
          DATABASE_URL: E2E_DATABASE_URL,
          UPLOAD_DIR: "./.uploads-e2e",
          BACKUP_DIR: "./.backups-e2e",
          SESSION_SECRET: "e2e-secret",
          SESSION_DURATION_DAYS: "14",
          MAX_UPLOAD_MB: "25",
          ENABLE_JOBS: "false",
          TZ: "Europe/Paris",
        },
      },
});
