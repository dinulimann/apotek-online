import { defineConfig } from "@playwright/test";

// The real stack: the Spring Boot jar on a database rebuilt at start (profile e2e) with demo data,
// and the built web app served by vite preview, proxying /api to it.
const db = process.env.E2E_DATABASE_URL ?? "jdbc:postgresql://localhost:5580/apotek_e2e";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:4180",
    viewport: { width: 1280, height: 860 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
  },
  webServer: [
    {
      command: "java -jar target/apotek-0.0.1-SNAPSHOT.jar --server.port=8091",
      cwd: "../backend",
      url: "http://127.0.0.1:8091/api/categories",
      env: { DATABASE_URL: db, SPRING_PROFILES_ACTIVE: "e2e,demo", UPLOADS_DIR: "/tmp/apotek-e2e-uploads" },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npx vite preview --port 4180 --strictPort --host 127.0.0.1",
      url: "http://127.0.0.1:4180",
      env: { API_URL: "http://127.0.0.1:8091" },
      reuseExistingServer: false,
    },
  ],
});
