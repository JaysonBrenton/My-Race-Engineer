import type { Logger } from '@core/app';
import type { User, UserSession } from '@core/domain';

import { evaluateOriginHeader, parseAllowedOrigins } from '@/core/security/origin';
import { validateSessionTokenService } from '@/dependencies/auth';
import { applicationLogger } from '@/dependencies/logger';
import {
  fingerprintAuthFormToken,
  validateAuthFormToken,
  type ValidateAuthFormTokenResult,
} from '@/lib/auth/formTokens';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { IMPORT_FORM_TOKEN_HEADER } from '@/lib/liverc/importAuth';
import type { ValidateSessionTokenResult } from '@/core/app/services/auth/validateSessionToken';

type ValidateSessionToken = (token: string) => Promise<ValidateSessionTokenResult>;
type ValidateImportFormToken = (token: string | null) => ValidateAuthFormTokenResult;

export type ImportAuthorizationContext = {
  logger: Logger;
  requestId: string;
  route: string;
};

export type ImportAuthorizationOptions = {
  validateSessionToken?: ValidateSessionToken;
  validateFormToken?: ValidateImportFormToken;
  environment?: NodeJS.ProcessEnv;
};

export type ImportAuthorizationSuccess = {
  ok: true;
  session: UserSession;
  user: User;
};

export type ImportAuthorizationFailure = {
  ok: false;
  status: number;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type ImportAuthorizationResult = ImportAuthorizationSuccess | ImportAuthorizationFailure;

const defaultValidateSessionToken: ValidateSessionToken = (token) =>
  validateSessionTokenService.validate({ token });

const defaultValidateFormToken: ValidateImportFormToken = (token) =>
  validateAuthFormToken(token, 'liverc-import');

const extractCookieValue = (cookieHeader: string | null, name: string): string | undefined => {
  if (!cookieHeader) {
    return undefined;
  }

  const entries = cookieHeader.split(';');
  for (const entry of entries) {
    const [rawName, ...rest] = entry.split('=');
    if (rawName?.trim() === name) {
      const value = rest.join('=').trim();
      return value.length > 0 ? value : undefined;
    }
  }

  return undefined;
};

const buildFailure = (
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ImportAuthorizationFailure => ({
  ok: false,
  status,
  error: { code, message, ...(details ? { details } : {}) },
});

export async function authorizeImportRequest(
  request: Request,
  context: ImportAuthorizationContext,
  options: ImportAuthorizationOptions = {},
): Promise<ImportAuthorizationResult> {
  const logger = context.logger ?? applicationLogger;
  const { requestId, route } = context;

  const environment = options.environment ?? process.env;
  const validateSessionToken = options.validateSessionToken ?? defaultValidateSessionToken;
  const validateFormToken = options.validateFormToken ?? defaultValidateFormToken;

  const allowedOrigins = parseAllowedOrigins(environment, { logger });

  if (allowedOrigins.length > 0) {
    const originHeader = request.headers.get('origin');
    const evaluation = evaluateOriginHeader(originHeader, allowedOrigins, { logger, route });

    if (!evaluation.allowed) {
      logger.warn('LiveRC import rejected due to disallowed origin.', {
        event: 'liverc.import.auth.invalid_origin',
        outcome: 'forbidden',
        requestId,
        origin: originHeader ?? undefined,
        evaluation: evaluation.reason,
      });

      return buildFailure(
        403,
        'INVALID_ORIGIN',
        'Request origin is not allowed for LiveRC imports.',
      );
    }
  }

  const cookieHeader = request.headers.get('cookie');
  const sessionToken = extractCookieValue(cookieHeader, SESSION_COOKIE_NAME);

  if (!sessionToken) {
    logger.warn('LiveRC import rejected due to missing session cookie.', {
      event: 'liverc.import.auth.missing_session',
      outcome: 'unauthenticated',
      requestId,
    });

    return buildFailure(
      401,
      'UNAUTHENTICATED',
      'Authentication is required to import LiveRC data.',
    );
  }

  const sessionValidation = await validateSessionToken(sessionToken);

  if (!sessionValidation.ok) {
    logger.warn('LiveRC import rejected due to invalid session.', {
      event: 'liverc.import.auth.invalid_session',
      outcome: 'unauthenticated',
      requestId,
      reason: sessionValidation.reason,
    });

    return buildFailure(
      401,
      'INVALID_SESSION',
      'Session is invalid or expired. Please sign in again.',
    );
  }

  const rawFormToken = request.headers.get(IMPORT_FORM_TOKEN_HEADER);
  const tokenValidation = validateFormToken(rawFormToken);

  if (!tokenValidation.ok) {
    logger.warn('LiveRC import rejected due to invalid form token.', {
      event: 'liverc.import.auth.invalid_form_token',
      outcome: 'forbidden',
      requestId,
      reason: tokenValidation.reason,
      tokenFingerprint: rawFormToken ? fingerprintAuthFormToken(rawFormToken) : undefined,
    });

    return buildFailure(403, 'INVALID_FORM_TOKEN', 'Import request token is invalid or expired.');
  }

  return {
    ok: true,
    session: sessionValidation.session,
    user: sessionValidation.user,
  };
}
