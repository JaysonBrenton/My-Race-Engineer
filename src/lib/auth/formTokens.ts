import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { applicationLogger } from '@/dependencies/logger';
import { EnvironmentValidationError, getEnvironment } from '@/server/config/environment';

export type AuthFormContext =
  | 'login'
  | 'registration'
  | 'password-reset'
  | 'password-reset-confirm'
  | 'verification-resend'
  | 'liverc-import';

export class MissingAuthFormTokenSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingAuthFormTokenSecretError';
  }
}

export const FORM_TOKEN_PREFIX = 'mre-auth';

export const FORM_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes
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

const encodeIssuedAt = (issuedAtMs: number): string => issuedAtMs.toString(36);

const decodeIssuedAt = (encoded: string): number | null => {
  if (!encoded) {
    return null;
  }

  const parsed = Number.parseInt(encoded, 36);
  return Number.isNaN(parsed) ? null : parsed;
};

export const generateAuthFormToken = (context: AuthFormContext) => {
  const issuedAtMs = Date.now();
  const issuedAt = encodeIssuedAt(issuedAtMs);
  const nonce = randomUUID();
  const secret = getFormTokenSecret();

  const signature = createHmac('sha256', secret)
    .update(`${FORM_TOKEN_PREFIX}:${context}:${issuedAt}:${nonce}`)
    .digest('base64url');

  return `${FORM_TOKEN_PREFIX}.${context}.${issuedAt}.${nonce}.${signature}`;
};

export const describeAuthFormToken = (token: string) => {
  const [prefix, context, issuedAtEncoded] = token.split('.', 3);
  const issuedAtMs = issuedAtEncoded ? decodeIssuedAt(issuedAtEncoded) : null;
  return {
    prefix,
    context: context as AuthFormContext | undefined,
    issuedAtMs: issuedAtMs ?? undefined,
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

  const [prefix, context, issuedAtEncoded, nonce, signature] = parts;

  return { prefix, context, issuedAtEncoded, nonce, signature };
};

const computeIssuedAtDate = (encoded: string): Date | null => {
  const issuedAtMs = decodeIssuedAt(encoded);
  if (issuedAtMs === null) {
    return null;
  }

  const issuedAt = new Date(issuedAtMs);
  return Number.isNaN(issuedAt.getTime()) ? null : issuedAt;
};

export const fingerprintAuthFormToken = (token: string): string => {
  const start = token.slice(0, 4);
  const end = token.slice(-4);
  return `${start}…${end}`;
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

  const { prefix, context, issuedAtEncoded, nonce, signature } = decoded;

  if (prefix !== FORM_TOKEN_PREFIX) {
    return { ok: false, reason: 'malformed' };
  }

  if (context !== expectedContext) {
    return { ok: false, reason: 'unexpected-context' };
  }

  const issuedAt = computeIssuedAtDate(issuedAtEncoded);

  if (!issuedAt) {
    return { ok: false, reason: 'malformed' };
  }

  if (now.getTime() - issuedAt.getTime() > FORM_TOKEN_TTL_MS) {
    return { ok: false, reason: 'expired' };
  }

  const secret = getFormTokenSecret();
  const expectedSignature = createHmac('sha256', secret)
    .update(`${FORM_TOKEN_PREFIX}:${context}:${issuedAtEncoded}:${nonce}`)
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
