import { expect, test } from '@playwright/test';

import { closeDb, deleteUserByEmail, findUserByEmail } from './db';

const uniqueEmail = () => `test+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
const strongPass = 'Abc12345!Abc12345!';

test.afterAll(async () => {
  await closeDb();
});

test('register creates DB user and sets session cookie (HTTP vs proxied-HTTPS)', async ({ page, context }, testInfo) => {
  const email = uniqueEmail();
  try {
    await page.goto('/auth/register');
    await page.getByLabel(/full name/i).fill('Playwright User');
    await page.getByLabel(/work email/i).fill(email);
    await page.getByLabel(/^password$/i).fill(strongPass);
    await page.getByLabel(/confirm password/i).fill(strongPass);
    await page.getByRole('button', { name: /create account/i }).click();
    await page.waitForLoadState('networkidle');

    await expect.poll(async () => findUserByEmail(email), {
      message: 'user should exist in DB',
    }).toBeTruthy();

    const cookies = await context.cookies();
    const session = cookies.find((cookie) => cookie.name.toLowerCase().includes('session'));
    expect(session, 'session cookie should be set').toBeTruthy();

    const httpsProject = testInfo.project.name === 'https-proxied';
    expect(Boolean(session?.secure)).toBe(httpsProject);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('login establishes session for existing user', async ({ page, context }) => {
  const email = uniqueEmail();
  try {
    await page.goto('/auth/register');
    await page.getByLabel(/full name/i).fill('Playwright User');
    await page.getByLabel(/work email/i).fill(email);
    await page.getByLabel(/^password$/i).fill(strongPass);
    await page.getByLabel(/confirm password/i).fill(strongPass);
    await page.getByRole('button', { name: /create account/i }).click();
    await page.waitForLoadState('networkidle');

    await context.clearCookies();

    await page.goto('/auth/login');
    await page.getByLabel(/email address or driver name/i).fill(email);
    await page.getByLabel(/^password$/i).fill(strongPass);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForLoadState('networkidle');

    const cookies = await context.cookies();
    const session = cookies.find((cookie) => cookie.name.toLowerCase().includes('session'));
    expect(session, 'session cookie should be set on login').toBeTruthy();
  } finally {
    await deleteUserByEmail(email);
  }
});

test('origin guard blocks cross-origin POST', async ({ request }) => {
  const email = uniqueEmail();
  const form = new URLSearchParams({
    name: 'X Origin',
    email,
    password: strongPass,
    confirmPassword: strongPass,
  }).toString();

  const response = await request.post('/auth/register', {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'http://example.com',
    },
    data: form,
    maxRedirects: 0,
    failOnStatusCode: false,
  });

  expect([302, 303, 307, 308]).toContain(response.status());
  const location = response.headers()['location'] ?? '';
  expect(location).toMatch(/error=invalid-origin/i);
});
