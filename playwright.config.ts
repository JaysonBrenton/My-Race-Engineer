import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  reporter: 'list',
  use: { browserName: 'chromium', baseURL: 'http://127.0.0.1:3101' },
  webServer: {
    command:
      'PORT=3101 APP_URL=http://127.0.0.1:3101 TRUST_PROXY=true FEATURE_REQUIRE_EMAIL_VERIFICATION=false FEATURE_REQUIRE_ADMIN_APPROVAL=false npm run start -- -p 3101 -H 127.0.0.1',
    url: 'http://127.0.0.1:3101/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: 'http' },
    { name: 'https-proxied', use: { extraHTTPHeaders: { 'x-forwarded-proto': 'https' } } },
  ],
});
