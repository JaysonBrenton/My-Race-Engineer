import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRegisterAction,
  type RegisterActionDependencies,
} from '../../../src/app/(auth)/auth/register/actions.impl';
import {
  createLoginAction,
  type LoginActionDependencies,
} from '../../../src/app/(auth)/auth/login/actions.impl';
import type { Logger } from '../../../src/core/app';

type RedirectTarget = string;

class RedirectCaptured extends Error {
  constructor(public readonly location: RedirectTarget) {
    super(`Redirected to ${location}`);
    this.name = 'RedirectCaptured';
  }
}

const createLogger = (): Logger => {
  const logger: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    withContext: () => logger,
  };

  return logger;
};

const withSpanStub: RegisterActionDependencies['withSpan'] = async (_name, _attributes, callback) =>
  callback({
    setAttribute: () => {},
    recordException: () => {},
  } as any);

type RecordedCookie = {
  name: string;
  value: string;
  secure?: boolean;
  expires?: Date | undefined;
  [key: string]: unknown;
};

const normaliseCookieRecord = (input: Record<string, unknown>): RecordedCookie => {
  const record: RecordedCookie = {
    name: String(input.name ?? ''),
    value: String(input.value ?? ''),
  };

  if ('secure' in input) {
    record.secure = Boolean(input.secure);
  }

  if ('expires' in input) {
    const raw = input.expires;
    if (raw instanceof Date) {
      record.expires = raw;
    } else if (typeof raw === 'string') {
      record.expires = new Date(raw);
    }
  }

  return { ...input, ...record };
};

const createRegisterCookieStub = () => {
  const records: RecordedCookie[] = [];
  const jar = {
    set: (arg1: any, arg2?: any, arg3?: any) => {
      if (typeof arg1 === 'string') {
        records.push(normaliseCookieRecord({ name: arg1, value: arg2, ...(arg3 ?? {}) }));
      } else {
        records.push(normaliseCookieRecord({ ...(arg1 as Record<string, unknown>) }));
      }

      return jar;
    },
  };

  return { jar: jar as unknown as ReturnType<RegisterActionDependencies['cookies']>, records };
};

const createLoginCookieStub = () => {
  const records: RecordedCookie[] = [];
  const jar = {
    set: (arg1: any, arg2?: any, arg3?: any) => {
      if (typeof arg1 === 'string') {
        records.push(normaliseCookieRecord({ name: arg1, value: arg2, ...(arg3 ?? {}) }));
      } else {
        records.push(normaliseCookieRecord({ ...(arg1 as Record<string, unknown>) }));
      }

      return jar;
    },
  };

  return { jar: jar as unknown as ReturnType<LoginActionDependencies['cookies']>, records };
};

type RegisterDepsResult = {
  deps: RegisterActionDependencies;
  cookiesSet: RecordedCookie[];
  redirectCalls: RedirectTarget[];
};

const createRegisterDeps = (
  overrides: Partial<RegisterActionDependencies> = {},
): RegisterDepsResult => {
  const { jar: cookieJar, records: cookiesSet } = createRegisterCookieStub();
  const redirectCalls: RedirectTarget[] = [];
  const logger = createLogger();
  const defaultDeps: RegisterActionDependencies = {
    headers: () =>
      new Headers({
        'x-request-id': 'register-test',
        origin: 'https://app.local',
        'user-agent': 'node:test',
      }),
    cookies: () => cookieJar,
    redirect: (destination: string | URL) => {
      const location = typeof destination === 'string' ? destination : destination.toString();
      redirectCalls.push(location);
      throw new RedirectCaptured(location);
    },
    guardAuthPostOrigin: () => {},
    checkRegisterRateLimit: () => ({ ok: true }),
    validateAuthFormToken: () => ({ ok: true, issuedAt: new Date() }),
    extractClientIdentifier: () => '198.51.100.10',
    createLogFingerprint: () => 'register-fingerprint',
    withSpan: withSpanStub,
    getAuthRequestLogger: () => logger,
    registerUserService: {
      register: async () => ({
        ok: true as const,
        nextStep: 'session-created' as const,
        session: {
          token: 'session-token',
          expiresAt: new Date(Date.now() + 60_000),
        },
        user: {
          id: 'user-1',
          name: 'Example User',
          email: 'user@example.com',
          status: 'active',
          passwordHash: 'hash',
          createdAt: new Date(),
          updatedAt: new Date(),
          emailVerifiedAt: new Date(),
        },
      }),
    },
    computeCookieSecure: () => true,
  };

  return {
    deps: { ...defaultDeps, ...overrides },
    cookiesSet,
    redirectCalls,
  };
};

type LoginDepsResult = {
  deps: LoginActionDependencies;
  cookiesSet: RecordedCookie[];
  redirectCalls: RedirectTarget[];
};

const createLoginDeps = (overrides: Partial<LoginActionDependencies> = {}): LoginDepsResult => {
  const { jar: cookieJar, records: cookiesSet } = createLoginCookieStub();
  const redirectCalls: RedirectTarget[] = [];
  const logger = createLogger();
  const defaultDeps: LoginActionDependencies = {
    headers: () =>
      new Headers({
        'x-request-id': 'login-test',
        origin: 'https://app.local',
        'user-agent': 'node:test',
      }),
    cookies: () => cookieJar,
    redirect: (destination: string | URL) => {
      const location = typeof destination === 'string' ? destination : destination.toString();
      redirectCalls.push(location);
      throw new RedirectCaptured(location);
    },
    guardAuthPostOrigin: () => {},
    checkLoginRateLimit: () => ({ ok: true }),
    validateAuthFormToken: () => ({ ok: true, issuedAt: new Date() }),
    extractClientIdentifier: () => '203.0.113.50',
    createLogFingerprint: () => 'login-fingerprint',
    withSpan: withSpanStub,
    getAuthRequestLogger: () => logger,
    loginUserService: {
      login: async () => ({
        ok: true as const,
        sessionToken: 'session-token',
        expiresAt: new Date(Date.now() + 120_000),
        user: {
          id: 'user-1',
          name: 'Example User',
          email: 'user@example.com',
          status: 'active',
          passwordHash: 'hash',
          createdAt: new Date(),
          updatedAt: new Date(),
          emailVerifiedAt: new Date(),
        },
      }),
    },
    computeCookieSecure: () => true,
  };

  return {
    deps: { ...defaultDeps, ...overrides },
    cookiesSet,
    redirectCalls,
  };
};

test('registerAction redirects with invalid-origin when the guard rejects the submission', async () => {
  let registerCalled = false;
  const { deps } = createRegisterDeps({
    guardAuthPostOrigin: (_headers, onFailure) => {
      onFailure();
    },
    registerUserService: {
      register: async () => {
        registerCalled = true;
        return {
          ok: true as const,
          nextStep: 'session-created' as const,
          session: {
            token: 'unused',
            expiresAt: new Date(),
          },
          user: {
            id: 'user-1',
            name: 'Example User',
            email: 'user@example.com',
            status: 'active',
            passwordHash: 'hash',
            createdAt: new Date(),
            updatedAt: new Date(),
            emailVerifiedAt: new Date(),
          },
        };
      },
    },
  });
  const registerAction = createRegisterAction(deps);
  const formData = new FormData();
  formData.set('name', ' Example User ');
  formData.set('email', 'USER@example.com ');
  formData.set('password', 'Str0ngPassword!23');
  formData.set('confirmPassword', 'Str0ngPassword!23');
  formData.set('formToken', 'token');

  try {
    await registerAction(formData);
    assert.fail('Expected register action to redirect when origin validation fails.');
  } catch (error) {
    assert.ok(error instanceof RedirectCaptured);
    const url = new URL(`https://app.local${error.location}`);
    assert.equal(url.pathname, '/auth/register');
    assert.equal(url.searchParams.get('error'), 'invalid-origin');
    assert.equal(url.searchParams.get('name'), 'Example User');
    assert.equal(url.searchParams.get('email'), 'USER@example.com');
    const prefillParam = url.searchParams.get('prefill');
    assert.ok(prefillParam);
    assert.deepEqual(JSON.parse(prefillParam), {
      name: 'Example User',
      email: 'USER@example.com',
    });
  }

  assert.equal(registerCalled, false);
});

test('registerAction redirects with validation error for mismatched passwords without calling the service', async () => {
  let registerInvocations = 0;
  const { deps } = createRegisterDeps({
    registerUserService: {
      register: async () => {
        registerInvocations += 1;
        return {
          ok: true as const,
          nextStep: 'session-created' as const,
          session: {
            token: 'unused',
            expiresAt: new Date(),
          },
          user: {
            id: 'user-1',
            name: 'Example User',
            email: 'user@example.com',
            status: 'active',
            passwordHash: 'hash',
            createdAt: new Date(),
            updatedAt: new Date(),
            emailVerifiedAt: new Date(),
          },
        };
      },
    },
  });
  const registerAction = createRegisterAction(deps);
  const formData = new FormData();
  formData.set('name', 'Example User');
  formData.set('email', 'user@example.com');
  formData.set('password', 'Str0ngPassword!23');
  formData.set('confirmPassword', 'WrongPassword!23');
  formData.set('formToken', 'token');

  try {
    await registerAction(formData);
    assert.fail('Expected register action to redirect when validation fails.');
  } catch (error) {
    assert.ok(error instanceof RedirectCaptured);
    const url = new URL(`https://app.local${error.location}`);
    assert.equal(url.pathname, '/auth/register');
    assert.equal(url.searchParams.get('error'), 'validation');
    assert.equal(url.searchParams.get('name'), 'Example User');
    assert.equal(url.searchParams.get('email'), 'user@example.com');
    const prefillParam = url.searchParams.get('prefill');
    assert.ok(prefillParam);
    assert.deepEqual(JSON.parse(prefillParam), {
      name: 'Example User',
      email: 'user@example.com',
    });
  }

  assert.equal(registerInvocations, 0);
});

test('registerAction issues a session cookie and redirects on successful registration', async () => {
  const expiresAt = new Date('2025-01-01T00:01:00.000Z');
  let receivedPayload: unknown;
  const { deps, cookiesSet } = createRegisterDeps({
    registerUserService: {
      register: async (payload) => {
        receivedPayload = payload;
        return {
          ok: true as const,
          nextStep: 'session-created' as const,
          session: {
            token: 'session-token',
            expiresAt,
          },
          user: {
            id: 'user-123',
            name: 'Example User',
            email: 'user@example.com',
            status: 'active',
            passwordHash: 'hash',
            createdAt: new Date(),
            updatedAt: new Date(),
            emailVerifiedAt: new Date(),
          },
        };
      },
    },
    computeCookieSecure: () => false,
  });
  const registerAction = createRegisterAction(deps);
  const formData = new FormData();
  formData.set('name', ' Example User ');
  formData.set('email', 'User@example.com');
  formData.set('password', 'Str0ngPassword!23');
  formData.set('confirmPassword', 'Str0ngPassword!23');
  formData.set('formToken', 'token');

  try {
    await registerAction(formData);
    assert.fail('Expected registration action to redirect after success.');
  } catch (error) {
    assert.ok(error instanceof RedirectCaptured);
    assert.equal(error.location, '/dashboard');
  }

  assert.deepEqual(receivedPayload, {
    name: 'Example User',
    email: 'user@example.com',
    password: 'Str0ngPassword!23',
    rememberSession: true,
    sessionContext: {
      ipAddress: '198.51.100.10',
      userAgent: 'node:test',
    },
  });

  assert.equal(cookiesSet.length, 1);
  const cookie = cookiesSet[0];
  assert.equal(cookie.name, 'mre_session');
  assert.equal(cookie.value, 'session-token');
  assert.equal(cookie.secure, false);
  assert.equal(cookie.expires?.toISOString(), expiresAt.toISOString());
});

test('loginAction redirects back to the form when the token is invalid', async () => {
  let loginInvocations = 0;
  const { deps } = createLoginDeps({
    validateAuthFormToken: () => ({ ok: false, reason: 'missing' }),
    loginUserService: {
      login: async () => {
        loginInvocations += 1;
        return {
          ok: true as const,
          sessionToken: 'session-token',
          expiresAt: new Date(),
          user: {
            id: 'user-1',
            name: 'Example User',
            email: 'user@example.com',
            status: 'active',
            passwordHash: 'hash',
            createdAt: new Date(),
            updatedAt: new Date(),
            emailVerifiedAt: new Date(),
          },
        };
      },
    },
  });
  const loginAction = createLoginAction(deps);
  const formData = new FormData();
  formData.set('email', 'user@example.com');
  formData.set('password', 'correct-horse-battery-staple');

  try {
    await loginAction(formData);
    assert.fail('Expected login action to redirect when the form token is invalid.');
  } catch (error) {
    assert.ok(error instanceof RedirectCaptured);
    assert.equal(error.location, '/auth/login?error=invalid-token');
  }

  assert.equal(loginInvocations, 0);
});

test('loginAction mints a session cookie and redirects to the dashboard on success', async () => {
  const expiresAt = new Date('2025-01-01T00:00:30.000Z');
  let capturedLoginPayload: unknown;
  const { deps, cookiesSet } = createLoginDeps({
    loginUserService: {
      login: async (payload) => {
        capturedLoginPayload = payload;
        return {
          ok: true as const,
          sessionToken: 'session-token',
          expiresAt,
          user: {
            id: 'user-777',
            name: 'Example User',
            email: 'user@example.com',
            status: 'active',
            passwordHash: 'hash',
            createdAt: new Date(),
            updatedAt: new Date(),
            emailVerifiedAt: new Date(),
          },
        };
      },
    },
    computeCookieSecure: () => false,
  });
  const loginAction = createLoginAction(deps);
  const formData = new FormData();
  formData.set('email', 'User@example.com');
  formData.set('password', 'correct-horse-battery-staple');
  formData.set('remember', 'true');
  formData.set('formToken', 'token');

  try {
    await loginAction(formData);
    assert.fail('Expected login action to redirect after success.');
  } catch (error) {
    assert.ok(error instanceof RedirectCaptured);
    assert.equal(error.location, '/dashboard');
  }

  assert.deepEqual(capturedLoginPayload, {
    email: 'user@example.com',
    password: 'correct-horse-battery-staple',
    rememberSession: true,
    sessionContext: {
      ipAddress: '203.0.113.50',
      userAgent: 'node:test',
    },
  });

  assert.equal(cookiesSet.length, 1);
  const cookie = cookiesSet[0];
  assert.equal(cookie.name, 'mre_session');
  assert.equal(cookie.value, 'session-token');
  assert.equal(cookie.secure, false);
  assert.equal(cookie.expires?.toISOString(), expiresAt.toISOString());
});
