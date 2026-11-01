import { defineConfig, devices } from '@playwright/test';
const port = process.env.PORT || 4173, origin = `http://127.0.0.1:${port}`;
// Real course files must never reach traces or reports; see tests/README.md.
const local = process.env.BRIDGE_LOCAL_FILES === '1';
export default defineConfig({
  testDir: './e2e', fullyParallel: true, forbidOnly: !!process.env.CI,
  retries: process.env.CI && !local ? 1 : 0, workers: process.env.CI ? 1 : 2,
  reporter: local ? [['list']] : [['list'], ['html', { open: 'never' }]],
  use: { baseURL: origin, trace: local ? 'off' : 'on-first-retry', screenshot: 'off', video: 'off' },
  // Each browser runs against the served site and the single-file standalone build.
  projects: Object.entries({ chromium: 'Desktop Chrome', firefox: 'Desktop Firefox', webkit: 'Desktop Safari' })
    .flatMap(([name, device]) => [
      { name, use: { ...devices[device] } },
      { name: `${name}-standalone`, use: { ...devices[device], format: 'standalone' } },
    ]),
  webServer: { command: 'npm run build && npm run preview', url: origin, reuseExistingServer: false },
});
