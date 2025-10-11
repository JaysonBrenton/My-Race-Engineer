import { expect, test } from '@playwright/test';

import { deleteUserByEmail } from './db';

const strongPassword = 'Abc12345!Abc12345!';

const uniqueEmail = () => `raw-register+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

const extractHiddenInput = (html: string, name: string): string | null => {
  const pattern = new RegExp(
    `<input[^>]*name=["']${name}["'][^>]*value=["']([^"']+)["']`,
    'i',
  );
  const match = html.match(pattern);
  return match ? match[1] : null;
};

const redirectStatus = new Set([302, 303, 307, 308]);

test('raw POST registration issues redirect or surfaces inline error', async ({ request }, testInfo) => {
  const email = uniqueEmail();
  const registrationPage = await request.get('/auth/register');
  expect(registrationPage.ok()).toBeTruthy();
  const pageHtml = await registrationPage.text();
  const formToken = extractHiddenInput(pageHtml, 'formToken');
  expect(formToken).toBeTruthy();

  const body = new URLSearchParams({
    name: 'Raw Register User',
    email,
    password: strongPassword,
    confirmPassword: strongPassword,
    formToken: formToken ?? '',
  }).toString();

  const response = await request.post('/auth/register', {
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
  };

  await testInfo.attach('auth-register-debug-headers', {
    body: JSON.stringify({ status: response.status(), ...debugHeaders }, null, 2),
    contentType: 'application/json',
  });

  try {
    if (redirectStatus.has(response.status())) {
      if (debugHeaders.action) {
        expect(debugHeaders.action).toBe('register');
      }
      if (debugHeaders.outcome) {
        expect(debugHeaders.outcome).toBe('redirect');
      }
      if (debugHeaders.token) {
        expect(debugHeaders.token).toBe('ok');
      }
      expect(debugHeaders.location).toBeTruthy();
      expect(debugHeaders.location).not.toMatch(/error=invalid-origin/i);

      if (debugHeaders.location?.startsWith('/auth/login')) {
        expect(debugHeaders.location).toMatch(/status=(verify-email|awaiting-approval)/);
      } else {
        expect(debugHeaders.location).toBe('/dashboard');
      }
    } else {
      expect(response.status()).toBe(200);
      if (debugHeaders.action) {
        expect(debugHeaders.action).toBe('register');
      }
      if (debugHeaders.outcome) {
        expect(debugHeaders.outcome).toBe('rerender');
      }
      if (debugHeaders.token) {
        expect(['ok', 'expired', 'invalid']).toContain(debugHeaders.token);
      }
      const html = await response.text();
      expect(html).toMatch(/auth-register-status/);
      expect(
        /Please fix the highlighted fields|Your form expired\. Please try again\.|We could not complete registration\./.test(html),
      ).toBeTruthy();
    }
  } finally {
    if (process.env.DATABASE_URL) {
      await deleteUserByEmail(email);
    }
  }
});
