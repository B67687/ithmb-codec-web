import { defineConfig } from "@playwright/test";

// act (nektos) runs GitHub Actions locally with host networking: it sets CI=true
// (so reuseExistingServer turns off) while still seeing the host's bound :8899
// preview server, which collides with the one Playwright tries to start. Detect
// act via ACT=true and move the web server onto a dedicated free port so the
// container can start its own instance. Real GitHub CI keeps the default port
// (isolated VM, never collides); local dev keeps the 8899 reuse flow (ADR-0007).
//
// Under act the 3-browser matrix jobs run IN PARALLEL on the same host network,
// so each must bind a DISTINCT port (chromium 8999 / firefox 8998 / webkit 8997) —
// a single shared port would have the jobs collide with each other (VALIDATION
// learning #2). The workflow passes the matrix browser via PLAYWRIGHT_BROWSER.
const underAct = process.env.ACT === "true";
export const ACT_PORTS: Record<string, number> = {
  chromium: 8999,
  firefox: 8998,
  webkit: 8997,
};
export function resolveWebPort(
  act: boolean,
  browser: string | undefined,
): number {
  return act ? (ACT_PORTS[browser ?? ""] ?? 8999) : 8899;
}
const webPort = resolveWebPort(underAct, process.env.PLAYWRIGHT_BROWSER);

export default defineConfig({
  testDir: "./tests",
  testIgnore: ["**/unit/**"],
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: "list",
  use: {
    // Local-first default: tests must hit a real server (the committed
    // static build served by npm run serve). CI overrides via BASE_URL.
    // Never default to the production site - that silently tests prod.
    baseURL: process.env.BASE_URL || `http://localhost:${webPort}`,
    trace: "on-first-retry",
    headless: true,
  },
  // Own the local server lifecycle: Playwright starts it, polls the URL until
  // ready (replacing the fixed `sleep 3` + shell trap that was racy on slow
  // runners), and kills it on exit. Reuses an already-running server when not
  // in CI (preserves `npm run serve` local flow). See ADR-0007.
  webServer: {
    command: `npx http-server -p ${webPort} -c-1 -s`,
    url: `http://localhost:${webPort}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        launchOptions: {
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
      },
    },
    {
      name: "firefox",
      use: {
        browserName: "firefox",
        launchOptions: {
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
      },
    },
    {
      name: "webkit",
      use: {
        browserName: "webkit",
      },
    },
  ],
});
