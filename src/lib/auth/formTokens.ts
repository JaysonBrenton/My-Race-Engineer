import { createHmac, randomBytes, randomUUID } from 'node:crypto';

export type AuthFormContext = 'login' | 'registration' | 'password-reset';

const FORM_TOKEN_PREFIX = 'mre.auth';
let ephemeralSecret: string | null = null;

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
