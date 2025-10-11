/**
 * Filename: src/server/config/environment.ts
 * Purpose: Parse and validate process environment variables into strongly typed configuration objects.
 * Author: Jayson Brenton
 * Date: 2025-10-11
 * License: MIT
 */

import {
  canonicaliseOrigin,
  isAbsoluteUrl,
  looksLikeSessionSecret,
  parseBooleanFlagValue,
  splitCsv,
  type EnvIssue,
} from './env-status';

export type EnvironmentConfig = {
  appUrl: URL;
  appOrigin: string;
  sessionSecret: string;
  allowedOrigins: string[];
  trustProxy: boolean;
  nextPublicBaseUrl: URL | null;
  features: {
    requireEmailVerification: boolean;
    requireAdminApproval: boolean;
    inviteOnly: boolean;
  };
};

export class EnvironmentValidationError extends Error {
  constructor(public readonly issues: EnvIssue[]) {
    super('Environment configuration is invalid.');
    this.name = 'EnvironmentValidationError';
  }
}

const booleanErrorMessage = (key: string) => `${key} must be set to "true" or "false".`;

const dedupe = <T>(values: T[]): T[] => {
  const seen = new Set<T>();
  const result: T[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
};

type AllowedOriginsParseResult = {
  origins: string[];
  explicit: boolean;
};

const parseAllowedOriginsList = (
  raw: string | undefined,
  issues: EnvIssue[],
): AllowedOriginsParseResult => {
  if (raw === undefined) {
    return { origins: [], explicit: false };
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    issues.push({
      key: 'ALLOWED_ORIGINS',
      message: 'ALLOWED_ORIGINS must list at least one origin.',
    });
    return { origins: [], explicit: false };
  }

  const parsed = splitCsv(trimmed);
  const validOrigins: string[] = [];
  let hadInvalid = false;

  for (const entry of parsed) {
    const canonical = canonicaliseOrigin(entry);
    if (!canonical) {
      hadInvalid = true;
      continue;
    }
    validOrigins.push(canonical);
  }

  if (parsed.length > 0 && validOrigins.length === 0 && !hadInvalid) {
    issues.push({
      key: 'ALLOWED_ORIGINS',
      message: 'ALLOWED_ORIGINS must list at least one origin.',
    });
  }

  if (hadInvalid) {
    issues.push({
      key: 'ALLOWED_ORIGINS',
      message: 'ALLOWED_ORIGINS must contain valid HTTP(S) origins.',
    });
  }

  return { origins: dedupe(validOrigins), explicit: true };
};

const readBooleanFlag = (
  key: string,
  raw: string | undefined,
  issues: EnvIssue[],
  defaultValue: boolean,
): boolean => {
  if (raw === undefined) {
    return defaultValue;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return defaultValue;
  }

  const parsed = parseBooleanFlagValue(trimmed);
  if (parsed === null) {
    issues.push({ key, message: booleanErrorMessage(key) });
    return defaultValue;
  }

  return parsed;
};

const parseSessionSecret = (raw: string | undefined, issues: EnvIssue[]): string | null => {
  const value = raw?.trim() ?? '';
  if (value.length === 0) {
    issues.push({ key: 'SESSION_SECRET', message: 'SESSION_SECRET is not configured.' });
    return null;
  }

  if (!looksLikeSessionSecret(value)) {
    issues.push({
      key: 'SESSION_SECRET',
      message: 'SESSION_SECRET must be at least 32 characters long.',
    });
    return null;
  }

  return value;
};

const parseAppUrl = (
  raw: string | undefined,
  issues: EnvIssue[],
): { appUrl: URL | null; origin: string | null } => {
  const value = raw?.trim();

  if (!value) {
    issues.push({ key: 'APP_URL', message: 'APP_URL is not configured.' });
    return { appUrl: null, origin: null };
  }

  if (!isAbsoluteUrl(value)) {
    issues.push({ key: 'APP_URL', message: 'APP_URL must be an absolute HTTP(S) URL.' });
    return { appUrl: null, origin: null };
  }

  try {
    const url = new URL(value);
    const origin = canonicaliseOrigin(value);
    if (!origin) {
      issues.push({ key: 'APP_URL', message: 'APP_URL must be an absolute HTTP(S) URL.' });
      return { appUrl: null, origin: null };
    }
    return { appUrl: url, origin };
  } catch (error) {
    issues.push({ key: 'APP_URL', message: 'APP_URL must be an absolute HTTP(S) URL.' });
    return { appUrl: null, origin: null };
  }
};

const parseNextPublicBaseUrl = (raw: string | undefined, issues: EnvIssue[]): URL | null => {
  const value = raw?.trim();
  if (!value) {
    return null;
  }

  if (!isAbsoluteUrl(value)) {
    issues.push({
      key: 'NEXT_PUBLIC_BASE_URL',
      message: 'NEXT_PUBLIC_BASE_URL must be an absolute HTTP(S) URL.',
    });
    return null;
  }

  try {
    return new URL(value);
  } catch (error) {
    issues.push({
      key: 'NEXT_PUBLIC_BASE_URL',
      message: 'NEXT_PUBLIC_BASE_URL must be an absolute HTTP(S) URL.',
    });
    return null;
  }
};

const dedupeIssues = (issues: EnvIssue[]): EnvIssue[] => {
  const seen = new Map<string, EnvIssue>();

  for (const issue of issues) {
    if (!seen.has(issue.key)) {
      seen.set(issue.key, issue);
    }
  }

  return Array.from(seen.values());
};

export const parseEnvironment = (env: Record<string, string | undefined>): EnvironmentConfig => {
  const issues: EnvIssue[] = [];

  const { appUrl, origin: appOrigin } = parseAppUrl(env.APP_URL, issues);
  const sessionSecret = parseSessionSecret(env.SESSION_SECRET, issues);
  const allowedOriginsResult = parseAllowedOriginsList(env.ALLOWED_ORIGINS, issues);
  const nextPublicBaseUrl = parseNextPublicBaseUrl(env.NEXT_PUBLIC_BASE_URL, issues);

  const trustProxy = readBooleanFlag('TRUST_PROXY', env.TRUST_PROXY, issues, false);
  const requireEmailVerification = readBooleanFlag(
    'FEATURE_REQUIRE_EMAIL_VERIFICATION',
    env.FEATURE_REQUIRE_EMAIL_VERIFICATION,
    issues,
    true,
  );
  const requireAdminApproval = readBooleanFlag(
    'FEATURE_REQUIRE_ADMIN_APPROVAL',
    env.FEATURE_REQUIRE_ADMIN_APPROVAL,
    issues,
    false,
  );
  const inviteOnly = readBooleanFlag(
    'FEATURE_INVITE_ONLY',
    env.FEATURE_INVITE_ONLY,
    issues,
    false,
  );

  let allowedOrigins = allowedOriginsResult.origins;
  if (appOrigin) {
    if (
      allowedOriginsResult.explicit &&
      allowedOrigins.length > 0 &&
      !allowedOrigins.includes(appOrigin)
    ) {
      issues.push({
        key: 'ALLOWED_ORIGINS',
        message: 'ALLOWED_ORIGINS should include APP_URL origin.',
      });
    }

    allowedOrigins = dedupe([...allowedOrigins, appOrigin]);
  }

  if (issues.length > 0) {
    throw new EnvironmentValidationError(dedupeIssues(issues));
  }

  return {
    appUrl: appUrl!,
    appOrigin: appOrigin!,
    sessionSecret: sessionSecret!,
    allowedOrigins,
    trustProxy,
    nextPublicBaseUrl,
    features: {
      requireEmailVerification,
      requireAdminApproval,
      inviteOnly,
    },
  };
};

let cachedEnvironment: EnvironmentConfig | null = null;

export const getEnvironment = (): EnvironmentConfig => {
  if (!cachedEnvironment) {
    cachedEnvironment = parseEnvironment(process.env);
  }

  return cachedEnvironment;
};

export const __resetEnvironmentCacheForTests = () => {
  cachedEnvironment = null;
};
