import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export type AuthFormContext = 'login' | 'registration' | 'password-reset';

const FORM_TOKEN_PREFIX = 'mre.auth';
let ephemeralSecret: string | null = null;
const FORM_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

const getFormTokenSecret = () => {
  const configuredSecret = process.env.SESSION_SECRET?.trim();
  if (configuredSecret && configuredSecret.length >= 32) {
    return configuredSecret;
  }

  if (!ephemeralSecret) {
    ephemeralSecret = randomBytes(32).toString('hex');
    console.warn(
      'SESSION_SECRET is not set or too short. Generated an ephemeral auth form token secret for this process. Do not rely on this outside local development.',
    );
  }

  return ephemeralSecret;
};

export const generateAuthFormToken = (context: AuthFormContext) => {
  const issuedAt = new Date().toISOString();
  const nonce = randomUUID();
  const secret = getFormTokenSecret();

  const signature = createHmac('sha256', secret)
    .update(`${FORM_TOKEN_PREFIX}:${context}:${issuedAt}:${nonce}`)
    .digest('base64url');

  return `${FORM_TOKEN_PREFIX}.${context}.${issuedAt}.${nonce}.${signature}`;
};

export const describeAuthFormToken = (token: string) => {
  const [prefix, context, issuedAt] = token.split('.', 3);
  return {
    prefix,
    context: context as AuthFormContext | undefined,
    issuedAt,
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

  const issuedAt = new Date(issuedAtIso);

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
