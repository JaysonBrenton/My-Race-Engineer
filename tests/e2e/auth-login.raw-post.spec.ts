import { expect, test } from '@playwright/test';

import { closeDb, createActiveUser, deleteUserByEmail } from './db';

const strongPassword = 'Abc12345!Abc12345!';

const uniqueEmail = () => `raw-login+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

const extractHiddenInput = (html: string, name: string): string | null => {
  const pattern = new RegExp(
    `<input[^>]*name=["']${name}["'][^>]*value=["']([^"']+)["']`,
    'i',
  );
  const match = html.match(pattern);
  return match ? match[1] : null;
};

const redirectStatus = new Set([302, 303, 307, 308]);

test.afterAll(async () => {
  await closeDb();
});

test('raw POST login exchanges credentials for a session redirect', async ({ request }, testInfo) => {
  test.skip(!process.env.DATABASE_URL, 'DATABASE_URL is required for login raw POST test');
  const email = uniqueEmail();
  await createActiveUser({
    name: 'Raw Login User',
    driverName: `RawDriver-${Date.now()}`,
    email,
    password: strongPassword,
  });

  const loginPage = await request.get('/auth/login');
  expect(loginPage.ok()).toBeTruthy();
  const pageHtml = await loginPage.text();
  const formToken = extractHiddenInput(pageHtml, 'formToken');
  expect(formToken).toBeTruthy();

  const body = new URLSearchParams({
    identifier: email,
    password: strongPassword,
    remember: 'true',
    formToken: formToken ?? '',
  }).toString();

  const response = await request.post('/auth/login', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: body,
    maxRedirects: 0,
    failOnStatusCode: false,
  });

  const headers = response.headers();
  const debugHeaders = {
    action: headers['x-auth-action'] ?? null,
    token: headers['x-auth-token'] ?? null,
    outcome: headers['x-auth-outcome'] ?? null,
    location: headers.location ?? null,
    setCookie: headers['set-cookie'] ?? null,
  };

  await testInfo.attach('auth-login-debug-headers', {
    body: JSON.stringify({ status: response.status(), ...debugHeaders }, null, 2),
    contentType: 'application/json',
  });

  try {
    if (debugHeaders.action) {
      expect(debugHeaders.action).toBe('login');
    }
    expect(redirectStatus.has(response.status())).toBeTruthy();
    if (debugHeaders.outcome) {
      expect(debugHeaders.outcome).toBe('redirect');
    }
    if (debugHeaders.token) {
      expect(debugHeaders.token).toBe('ok');
    }
    expect(debugHeaders.location).toBe('/dashboard');
    expect(debugHeaders.setCookie ?? '').toMatch(/mre_session/i);
  } finally {
    if (process.env.DATABASE_URL) {
      await deleteUserByEmail(email);
    }
  }
});

test('raw POST login accepts driver names as identifiers', async ({ request }, testInfo) => {
  test.skip(!process.env.DATABASE_URL, 'DATABASE_URL is required for login raw POST test');
  const email = uniqueEmail();
  const driverName = `RawDriverName-${Date.now()}`;
  await createActiveUser({
    name: 'Raw Login Driver User',
    driverName,
    email,
    password: strongPassword,
  });

  const loginPage = await request.get('/auth/login');
  expect(loginPage.ok()).toBeTruthy();
  const pageHtml = await loginPage.text();
  const formToken = extractHiddenInput(pageHtml, 'formToken');
  expect(formToken).toBeTruthy();

  const body = new URLSearchParams({
    identifier: driverName,
    password: strongPassword,
    formToken: formToken ?? '',
  }).toString();

  const response = await request.post('/auth/login', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: body,
    maxRedirects: 0,
    failOnStatusCode: false,
  });

  const headers = response.headers();
  const debugHeaders = {
    action: headers['x-auth-action'] ?? null,
    token: headers['x-auth-token'] ?? null,
    outcome: headers['x-auth-outcome'] ?? null,
    location: headers.location ?? null,
    setCookie: headers['set-cookie'] ?? null,
  };

  await testInfo.attach('auth-login-driver-debug-headers', {
    body: JSON.stringify({ status: response.status(), ...debugHeaders }, null, 2),
    contentType: 'application/json',
  });

  try {
    if (debugHeaders.action) {
      expect(debugHeaders.action).toBe('login');
    }
    expect(redirectStatus.has(response.status())).toBeTruthy();
    if (debugHeaders.outcome) {
      expect(debugHeaders.outcome).toBe('redirect');
    }
    if (debugHeaders.token) {
      expect(debugHeaders.token).toBe('ok');
    }
    expect(debugHeaders.location).toBe('/dashboard');
    expect(debugHeaders.setCookie ?? '').toMatch(/mre_session/i);
  } finally {
    if (process.env.DATABASE_URL) {
      await deleteUserByEmail(email);
    }
  }
});
