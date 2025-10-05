import { createHmac, randomBytes, randomUUID } from 'node:crypto';

import { applicationLogger } from '@/dependencies/logger';

export type AuthFormContext = 'login' | 'registration' | 'password-reset';

const FORM_TOKEN_PREFIX = 'mre.auth';
let ephemeralSecret: string | null = null;
const logger = applicationLogger.withContext({ route: 'auth/formTokens' });

const getFormTokenSecret = () => {
  const configuredSecret = process.env.SESSION_SECRET?.trim();
  if (configuredSecret && configuredSecret.length >= 32) {
    return configuredSecret;
  }

  if (!ephemeralSecret) {
    ephemeralSecret = randomBytes(32).toString('hex');
    logger.warn(
      'SESSION_SECRET missing or too short; generated ephemeral auth form token secret.',
      {
        event: 'auth.form_tokens.ephemeral_secret_generated',
        outcome: 'degraded',
      },
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
