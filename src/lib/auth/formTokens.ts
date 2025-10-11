import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { applicationLogger } from '@/dependencies/logger';
import { EnvironmentValidationError, getEnvironment } from '@/server/config/environment';

export type AuthFormContext =
  | 'login'
  | 'registration'
  | 'password-reset'
  | 'password-reset-confirm';

export class MissingAuthFormTokenSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingAuthFormTokenSecretError';
  }
}

const FORM_TOKEN_PREFIX = 'mre-auth';

const FORM_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes
const logger = applicationLogger.withContext({ route: 'auth/formTokens' });

const buildMissingSecretError = (reason: 'unset' | 'too-short') =>
  new MissingAuthFormTokenSecretError(
    reason === 'unset'
      ? 'SESSION_SECRET is not configured. Auth forms cannot be submitted until it is set to a 32+ character value.'
      : 'SESSION_SECRET must be at least 32 characters long. Auth forms cannot be submitted until it is updated.',
  );

const getFormTokenSecret = () => {
  try {
    return getEnvironment().sessionSecret;
  } catch (error) {
    if (error instanceof EnvironmentValidationError) {
      const issue = error.issues.find((entry) => entry.key === 'SESSION_SECRET');
      if (issue) {
        const reason = issue.message.includes('at least 32') ? 'too-short' : 'unset';

        if (reason === 'unset') {
          logger.error('SESSION_SECRET missing — auth forms disabled.', {
            event: 'auth.form_tokens.session_secret_missing',
            outcome: 'blocked',
          });
        } else {
          logger.error('SESSION_SECRET too short — auth forms disabled.', {
            event: 'auth.form_tokens.session_secret_too_short',
            outcome: 'blocked',
          });
        }

        throw buildMissingSecretError(reason);
      }
    }

    throw error;
  }
};

export const generateAuthFormToken = (context: AuthFormContext) => {
  const issuedAtMs = Date.now();
  const issuedAt = issuedAtMs.toString(10);
  const nonce = randomUUID();
  const secret = getFormTokenSecret();

  const signature = createHmac('sha256', secret)
    .update(`${FORM_TOKEN_PREFIX}:${context}:${issuedAt}:${nonce}`)
    .digest('base64url');

  return `${FORM_TOKEN_PREFIX}.${context}.${issuedAt}.${nonce}.${signature}`;
};

export const describeAuthFormToken = (token: string) => {
  const [prefix, context, issuedAt] = token.split('.', 3);
  const issuedAtMs = Number.parseInt(issuedAt ?? '', 10);
  return {
    prefix,
    context: context as AuthFormContext | undefined,
    issuedAtMs: Number.isNaN(issuedAtMs) ? undefined : issuedAtMs,
  };
};

type InvalidAuthFormTokenReason =
  | 'missing'
  | 'malformed'
  | 'unexpected-context'
  | 'expired'
  | 'signature-mismatch';

export type ValidateAuthFormTokenResult =
  | { ok: true; issuedAt: Date }
  | { ok: false; reason: InvalidAuthFormTokenReason };

const decodeFormToken = (token: string) => {
  const parts = token.split('.');
  if (parts.length !== 5) {
    return null;
  }

  const [prefix, context, issuedAtIso, nonce, signature] = parts;

  return { prefix, context, issuedAtIso, nonce, signature };
};

export const validateAuthFormToken = (
  token: string | null,
  expectedContext: AuthFormContext,
  now: Date = new Date(),
): ValidateAuthFormTokenResult => {
  if (!token) {
    return { ok: false, reason: 'missing' };
  }

  const decoded = decodeFormToken(token);
  if (!decoded) {
    return { ok: false, reason: 'malformed' };
  }

  const { prefix, context, issuedAtIso, nonce, signature } = decoded;

  if (prefix !== FORM_TOKEN_PREFIX) {
    return { ok: false, reason: 'malformed' };
  }

  if (context !== expectedContext) {
    return { ok: false, reason: 'unexpected-context' };
  }

  const issuedAtMs = Number.parseInt(issuedAtIso, 10);
  if (!Number.isFinite(issuedAtMs)) {
    return { ok: false, reason: 'malformed' };
  }

  const issuedAt = new Date(issuedAtMs);

  if (Number.isNaN(issuedAt.getTime())) {
    return { ok: false, reason: 'malformed' };
  }

  if (now.getTime() - issuedAt.getTime() > FORM_TOKEN_TTL_MS) {
    return { ok: false, reason: 'expired' };
  }

  const secret = getFormTokenSecret();
  const expectedSignature = createHmac('sha256', secret)
    .update(`${FORM_TOKEN_PREFIX}:${context}:${issuedAtIso}:${nonce}`)
    .digest('base64url');

  if (expectedSignature.length !== signature.length) {
    return { ok: false, reason: 'signature-mismatch' };
  }

  const expectedBuffer = Buffer.from(expectedSignature);
  const providedBuffer = Buffer.from(signature);

  if (!timingSafeEqual(expectedBuffer, providedBuffer)) {
    return { ok: false, reason: 'signature-mismatch' };
  }

  return { ok: true, issuedAt };
};
