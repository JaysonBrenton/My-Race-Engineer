/**
 * Filename: src/server/config/env-status.ts
 * Purpose: Inspect environment variables, surface configuration issues, and support env doctor tooling.
 * Author: Jayson Brenton
 * Date: 2025-10-11
 * License: MIT
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type EnvVariableExample = {
  key: string;
  value: string;
  leadingComments: string[];
};

export type EnvExample = {
  variables: EnvVariableExample[];
  byKey: Map<string, EnvVariableExample>;
};

export type EnvIssue = {
  key: string;
  message: string;
};

export type EnvDoctorReport = {
  missingKeys: string[];
  extraKeys: string[];
  invalidKeys: EnvIssue[];
  warnings: EnvIssue[];
  appliedDefaults: string[];
};

export type EnvDoctorOutcome = EnvDoctorReport & {
  isHealthy: boolean;
};

const TRUE_FLAG_VALUES = new Set(['1', 'true', 'yes', 'y', 'on']);
const FALSE_FLAG_VALUES = new Set(['0', 'false', 'no', 'n', 'off']);

const FEATURE_BOOLEAN_KEYS = new Set([
  'FEATURE_REQUIRE_EMAIL_VERIFICATION',
  'FEATURE_REQUIRE_ADMIN_APPROVAL',
  'FEATURE_INVITE_ONLY',
  'ENABLE_IMPORT_WIZARD',
  'ENABLE_LIVERC_RESOLVER',
  'ENABLE_IMPORT_FILE',
  'ENABLE_LIVERC_FIXTURE_PROXY',
]);

const LIVERC_FLAG_KEYS = [
  'ENABLE_IMPORT_WIZARD',
  'ENABLE_LIVERC_RESOLVER',
  'ENABLE_IMPORT_FILE',
  'ENABLE_LIVERC_FIXTURE_PROXY',
] as const;

const COOKIE_SECURE_STRATEGY_VALUES = new Set(['auto', 'always', 'never']);

const MAILER_DRIVERS = new Set(['console', 'smtp']);

const LEGACY_SMTP_KEYS = new Set([
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'MAIL_FROM',
  'MAIL_REPLY_TO',
  'NEXTAUTH_URL',
]);

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPositiveInteger(value: string): boolean {
  return /^\d+$/.test(value) && Number(value) > 0;
}

function isValidSmtpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'smtp:' && protocol !== 'smtps:') {
      return false;
    }

    if (!parsed.hostname) {
      return false;
    }

    if (!parsed.username || !parsed.password) {
      return false;
    }

    return parsed.port !== '';
  } catch {
    return false;
  }
}

export async function loadEnvExample(examplePath = '.env.example'): Promise<EnvExample> {
  const absolutePath = resolve(examplePath);
  const content = await readFile(absolutePath, 'utf8');
  const variables: EnvVariableExample[] = [];
  const byKey = new Map<string, EnvVariableExample>();

  const lines = content.split(/\r?\n/);
  let currentCommentBlock: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      currentCommentBlock = [];
      continue;
    }

    if (trimmed.startsWith('#')) {
      currentCommentBlock.push(line);
      continue;
    }

    const parsed = parseEnvKeyValue(trimmed);
    if (!parsed) {
      currentCommentBlock = [];
      continue;
    }

    const variable: EnvVariableExample = {
      key: parsed.key,
      value: parsed.value,
      leadingComments: [...currentCommentBlock],
    };
    variables.push(variable);
    byKey.set(variable.key, variable);
    currentCommentBlock = [];
  }

  return { variables, byKey };
}

export async function loadEnvFile(envPath = '.env'): Promise<Map<string, string>> {
  const absolutePath = resolve(envPath);

  if (!existsSync(absolutePath)) {
    return new Map();
  }

  const content = await readFile(absolutePath, 'utf8');
  return parseEnvFile(content);
}

export async function evaluateProcessEnvironment(
  examplePath = '.env.example',
): Promise<EnvDoctorOutcome> {
  const example = await loadEnvExample(examplePath);
  const actual: Record<string, string | undefined> = {};
  for (const variable of example.variables) {
    actual[variable.key] = process.env[variable.key];
  }

  return evaluateEnvironment({
    example,
    actual,
    actualKeys: example.variables.map((variable) => variable.key),
  });
}

export function parseEnvFile(content: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.length === 0) {
      continue;
    }

    if (line.startsWith('#')) {
      continue;
    }

    const parsed = parseEnvKeyValue(line);
    if (!parsed) {
      continue;
    }

    if (!map.has(parsed.key)) {
      map.set(parsed.key, stripWrappingQuotes(parsed.value));
    }
  }

  return map;
}

export function parseEnvKeyValue(line: string): { key: string; value: string } | null {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_\.-]*)\s*=\s*(.*)$/);
  if (!match) {
    return null;
  }

  return { key: match[1], value: match[2] ?? '' };
}

export function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function isAbsoluteUrl(value: string): boolean {
  if (!value) {
    return false;
  }

  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return /^(http|https):/i.test(value);
  } catch {
    return false;
  }
}

export function canonicaliseOrigin(value: string): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (!url.protocol || !url.host) {
      return null;
    }

    const protocol = url.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return null;
    }

    return `${protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export function looksLikeSessionSecret(value: string): boolean {
  return value.length >= 32;
}

export function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function parseBooleanFlagValue(value: string): boolean | null {
  const normalised = value.trim().toLowerCase();

  if (normalised.length === 0) {
    return null;
  }

  if (TRUE_FLAG_VALUES.has(normalised)) {
    return true;
  }

  if (FALSE_FLAG_VALUES.has(normalised)) {
    return false;
  }

  return null;
}

export function isBooleanFlagValue(value: string): boolean {
  return parseBooleanFlagValue(value) !== null;
}

export function evaluateEnvironment(options: {
  example: EnvExample;
  actual: Record<string, string | undefined>;
  actualKeys?: Iterable<string>;
}): EnvDoctorOutcome {
  const { example, actual } = options;
  const actualKeys = new Set(options.actualKeys ?? Object.keys(actual));
  const exampleKeys = new Set(example.variables.map((variable) => variable.key));

  const missing = new Set<string>();
  const invalid: EnvIssue[] = [];
  const warnings: EnvIssue[] = [];
  const appliedDefaults: string[] = [];

  const readValue = (key: string) => {
    const raw = actual[key];
    return { raw, trimmed: raw === undefined ? '' : raw.trim() };
  };

  const { raw: appUrlRaw, trimmed: appUrlTrimmed } = readValue('APP_URL');
  let appUrl: string | null = null;
  if (appUrlRaw === undefined) {
    missing.add('APP_URL');
  } else if (appUrlTrimmed.length === 0) {
    invalid.push({ key: 'APP_URL', message: 'APP_URL cannot be empty.' });
  } else if (!isAbsoluteUrl(appUrlTrimmed)) {
    invalid.push({ key: 'APP_URL', message: 'APP_URL must be an absolute HTTP(S) URL.' });
  } else {
    appUrl = appUrlTrimmed;
  }

  const { raw: sessionSecretRaw, trimmed: sessionSecretTrimmed } = readValue('SESSION_SECRET');
  if (sessionSecretRaw === undefined) {
    missing.add('SESSION_SECRET');
  } else if (sessionSecretTrimmed.length === 0) {
    invalid.push({ key: 'SESSION_SECRET', message: 'SESSION_SECRET cannot be empty.' });
  } else if (!looksLikeSessionSecret(sessionSecretTrimmed)) {
    invalid.push({
      key: 'SESSION_SECRET',
      message: 'SESSION_SECRET must be at least 32 characters long.',
    });
  }

  const { raw: cookieStrategyRaw, trimmed: cookieStrategyTrimmed } =
    readValue('COOKIE_SECURE_STRATEGY');
  if (cookieStrategyRaw === undefined) {
    missing.add('COOKIE_SECURE_STRATEGY');
  } else if (cookieStrategyTrimmed.length === 0) {
    invalid.push({
      key: 'COOKIE_SECURE_STRATEGY',
      message: 'COOKIE_SECURE_STRATEGY cannot be empty.',
    });
  } else if (!COOKIE_SECURE_STRATEGY_VALUES.has(cookieStrategyTrimmed)) {
    invalid.push({
      key: 'COOKIE_SECURE_STRATEGY',
      message: 'COOKIE_SECURE_STRATEGY must be one of auto, always, never.',
    });
  }

  const { raw: trustProxyRaw, trimmed: trustProxyTrimmed } = readValue('TRUST_PROXY');
  if (trustProxyRaw === undefined) {
    missing.add('TRUST_PROXY');
  } else if (trustProxyTrimmed.length === 0) {
    invalid.push({ key: 'TRUST_PROXY', message: 'TRUST_PROXY cannot be empty.' });
  } else if (parseBooleanFlagValue(trustProxyTrimmed) === null) {
    invalid.push({ key: 'TRUST_PROXY', message: 'TRUST_PROXY must be set to "true" or "false".' });
  }

  const { raw: allowedOriginsRaw, trimmed: allowedOriginsTrimmed } = readValue('ALLOWED_ORIGINS');
  let canonicalAllowedOrigins: string[] = [];
  if (allowedOriginsRaw === undefined) {
    missing.add('ALLOWED_ORIGINS');
  } else if (allowedOriginsTrimmed.length === 0) {
    invalid.push({
      key: 'ALLOWED_ORIGINS',
      message: 'ALLOWED_ORIGINS must list at least one origin.',
    });
  } else {
    const parsedOrigins = splitCsv(allowedOriginsTrimmed);
    if (parsedOrigins.length === 0) {
      invalid.push({
        key: 'ALLOWED_ORIGINS',
        message: 'ALLOWED_ORIGINS must list at least one origin.',
      });
    } else {
      const canonicalised = parsedOrigins.map(canonicaliseOrigin);
      const invalidOriginPresent = canonicalised.some((origin) => origin === null);
      if (invalidOriginPresent) {
        invalid.push({
          key: 'ALLOWED_ORIGINS',
          message: 'ALLOWED_ORIGINS must contain valid HTTP(S) origins.',
        });
      } else {
        canonicalAllowedOrigins = canonicalised as string[];
      }
    }
  }

  const { raw: publicOriginRaw, trimmed: publicOriginTrimmed } =
    readValue('NEXT_PUBLIC_APP_ORIGIN');
  if (publicOriginRaw === undefined) {
    missing.add('NEXT_PUBLIC_APP_ORIGIN');
  } else if (publicOriginTrimmed.length === 0) {
    if (appUrl) {
      warnings.push({
        key: 'NEXT_PUBLIC_APP_ORIGIN',
        message: 'NEXT_PUBLIC_APP_ORIGIN is empty; defaulting to APP_URL.',
      });
      appliedDefaults.push('NEXT_PUBLIC_APP_ORIGIN=APP_URL');
    } else {
      invalid.push({
        key: 'NEXT_PUBLIC_APP_ORIGIN',
        message: 'NEXT_PUBLIC_APP_ORIGIN cannot be empty until APP_URL is configured.',
      });
    }
  } else if (!isAbsoluteUrl(publicOriginTrimmed)) {
    invalid.push({
      key: 'NEXT_PUBLIC_APP_ORIGIN',
      message: 'NEXT_PUBLIC_APP_ORIGIN must be an absolute HTTP(S) URL.',
    });
  }

  const canonicalAppOrigin = appUrl ? canonicaliseOrigin(appUrl) : null;
  if (canonicalAppOrigin && canonicalAllowedOrigins.length > 0) {
    if (!canonicalAllowedOrigins.includes(canonicalAppOrigin)) {
      invalid.push({
        key: 'ALLOWED_ORIGINS',
        message: 'ALLOWED_ORIGINS should include APP_URL origin.',
      });
    }
  }

  const { raw: tracingRaw, trimmed: tracingTrimmed } = readValue('TRACING_ENABLED');
  let tracingEnabled = false;
  if (tracingRaw === undefined || tracingTrimmed.length === 0) {
    warnings.push({
      key: 'TRACING_ENABLED',
      message: 'TRACING_ENABLED is not set; defaulting to false.',
    });
    appliedDefaults.push('TRACING_ENABLED=false');
  } else {
    const parsed = parseBooleanFlagValue(tracingTrimmed);
    if (parsed === null) {
      invalid.push({
        key: 'TRACING_ENABLED',
        message: 'TRACING_ENABLED must be "true" or "false".',
      });
    } else {
      tracingEnabled = parsed;
    }
  }

  if (tracingEnabled) {
    const { raw: otelEndpointRaw, trimmed: otelEndpointTrimmed } = readValue(
      'OTEL_EXPORTER_OTLP_ENDPOINT',
    );
    if (otelEndpointRaw === undefined) {
      missing.add('OTEL_EXPORTER_OTLP_ENDPOINT');
    } else if (otelEndpointTrimmed.length === 0) {
      invalid.push({
        key: 'OTEL_EXPORTER_OTLP_ENDPOINT',
        message: 'OTEL_EXPORTER_OTLP_ENDPOINT cannot be empty when tracing is enabled.',
      });
    } else if (!isAbsoluteUrl(otelEndpointTrimmed)) {
      invalid.push({
        key: 'OTEL_EXPORTER_OTLP_ENDPOINT',
        message: 'OTEL_EXPORTER_OTLP_ENDPOINT must be an absolute HTTP(S) URL.',
      });
    }

    const { raw: otelServiceNameRaw, trimmed: otelServiceNameTrimmed } =
      readValue('OTEL_SERVICE_NAME');
    if (otelServiceNameRaw === undefined) {
      missing.add('OTEL_SERVICE_NAME');
    } else if (otelServiceNameTrimmed.length === 0) {
      invalid.push({
        key: 'OTEL_SERVICE_NAME',
        message: 'OTEL_SERVICE_NAME cannot be empty when tracing is enabled.',
      });
    }

    const { raw: otelHeadersRaw, trimmed: otelHeadersTrimmed } = readValue(
      'OTEL_EXPORTER_OTLP_HEADERS',
    );
    if (otelHeadersRaw !== undefined && otelHeadersTrimmed.length === 0) {
      warnings.push({
        key: 'OTEL_EXPORTER_OTLP_HEADERS',
        message:
          'OTEL_EXPORTER_OTLP_HEADERS is empty; remove it or provide comma-separated header pairs.',
      });
    }
  }

  const { raw: rateWindowRaw, trimmed: rateWindowTrimmed } = readValue(
    'INGEST_RATE_LIMIT_WINDOW_MS',
  );
  const { raw: rateMaxRaw, trimmed: rateMaxTrimmed } = readValue('INGEST_RATE_LIMIT_MAX_REQUESTS');
  const hasRateWindow = rateWindowRaw !== undefined && rateWindowTrimmed.length > 0;
  const hasRateMax = rateMaxRaw !== undefined && rateMaxTrimmed.length > 0;
  if (hasRateWindow || hasRateMax) {
    if (!hasRateWindow) {
      invalid.push({
        key: 'INGEST_RATE_LIMIT_WINDOW_MS',
        message: 'Provide INGEST_RATE_LIMIT_WINDOW_MS when enabling rate limiting.',
      });
    } else if (!isPositiveInteger(rateWindowTrimmed)) {
      invalid.push({
        key: 'INGEST_RATE_LIMIT_WINDOW_MS',
        message: 'INGEST_RATE_LIMIT_WINDOW_MS must be a positive integer (milliseconds).',
      });
    }

    if (!hasRateMax) {
      invalid.push({
        key: 'INGEST_RATE_LIMIT_MAX_REQUESTS',
        message: 'Provide INGEST_RATE_LIMIT_MAX_REQUESTS when enabling rate limiting.',
      });
    } else if (!isPositiveInteger(rateMaxTrimmed)) {
      invalid.push({
        key: 'INGEST_RATE_LIMIT_MAX_REQUESTS',
        message: 'INGEST_RATE_LIMIT_MAX_REQUESTS must be a positive integer.',
      });
    }
  }

  const { raw: mailerDriverRaw, trimmed: mailerDriverTrimmed } = readValue('MAILER_DRIVER');
  let mailerDriver = 'console';
  if (mailerDriverRaw === undefined || mailerDriverTrimmed.length === 0) {
    warnings.push({
      key: 'MAILER_DRIVER',
      message: 'MAILER_DRIVER is not set; defaulting to console.',
    });
    appliedDefaults.push('MAILER_DRIVER=console');
  } else {
    const driverCandidate = mailerDriverTrimmed.toLowerCase();
    if (!MAILER_DRIVERS.has(driverCandidate)) {
      invalid.push({
        key: 'MAILER_DRIVER',
        message: 'MAILER_DRIVER must be one of console, smtp.',
      });
    } else {
      mailerDriver = driverCandidate;
    }
  }

  if (mailerDriver === 'smtp') {
    const { raw: smtpUrlRaw, trimmed: smtpUrlTrimmed } = readValue('SMTP_URL');
    if (smtpUrlRaw === undefined) {
      missing.add('SMTP_URL');
    } else if (smtpUrlTrimmed.length === 0) {
      invalid.push({
        key: 'SMTP_URL',
        message: 'SMTP_URL cannot be empty when MAILER_DRIVER=smtp.',
      });
    } else if (!isValidSmtpUrl(smtpUrlTrimmed)) {
      invalid.push({
        key: 'SMTP_URL',
        message: 'SMTP_URL must look like smtp://user:pass@host:port or smtps://…',
      });
    }

    const { raw: mailFromEmailRaw, trimmed: mailFromEmailTrimmed } = readValue('MAIL_FROM_EMAIL');
    if (mailFromEmailRaw === undefined) {
      missing.add('MAIL_FROM_EMAIL');
    } else if (mailFromEmailTrimmed.length === 0) {
      invalid.push({
        key: 'MAIL_FROM_EMAIL',
        message: 'MAIL_FROM_EMAIL cannot be empty when MAILER_DRIVER=smtp.',
      });
    } else if (!looksLikeEmail(mailFromEmailTrimmed)) {
      invalid.push({
        key: 'MAIL_FROM_EMAIL',
        message: 'MAIL_FROM_EMAIL must look like an email address.',
      });
    }

    const { raw: mailFromNameRaw, trimmed: mailFromNameTrimmed } = readValue('MAIL_FROM_NAME');
    if (mailFromNameRaw === undefined) {
      missing.add('MAIL_FROM_NAME');
    } else if (mailFromNameTrimmed.length === 0) {
      invalid.push({
        key: 'MAIL_FROM_NAME',
        message: 'MAIL_FROM_NAME cannot be empty when MAILER_DRIVER=smtp.',
      });
    }
  }

  const liveRcEnabled = LIVERC_FLAG_KEYS.some((key) => {
    const { raw, trimmed } = readValue(key);
    if (raw === undefined || trimmed.length === 0) {
      return false;
    }
    const parsed = parseBooleanFlagValue(trimmed);
    if (parsed === null) {
      invalid.push({ key, message: `${key} must be set to "true" or "false".` });
      return false;
    }
    return parsed;
  });

  const { raw: liveRcBaseRaw, trimmed: liveRcBaseTrimmed } = readValue('LIVERC_HTTP_BASE');
  if (liveRcEnabled) {
    if (liveRcBaseRaw === undefined) {
      missing.add('LIVERC_HTTP_BASE');
    } else if (liveRcBaseTrimmed.length === 0) {
      invalid.push({
        key: 'LIVERC_HTTP_BASE',
        message: 'LIVERC_HTTP_BASE cannot be empty when LiveRC features are enabled.',
      });
    } else if (!isAbsoluteUrl(liveRcBaseTrimmed)) {
      invalid.push({
        key: 'LIVERC_HTTP_BASE',
        message: 'LIVERC_HTTP_BASE must be an absolute HTTP(S) URL.',
      });
    }
  }

  const { raw: publicBaseRaw, trimmed: publicBaseTrimmed } = readValue('NEXT_PUBLIC_BASE_URL');
  if (
    publicBaseRaw !== undefined &&
    publicBaseTrimmed.length > 0 &&
    !isAbsoluteUrl(publicBaseTrimmed)
  ) {
    invalid.push({
      key: 'NEXT_PUBLIC_BASE_URL',
      message: 'NEXT_PUBLIC_BASE_URL must be an absolute HTTP(S) URL.',
    });
  }

  for (const key of FEATURE_BOOLEAN_KEYS) {
    const { raw, trimmed } = readValue(key);
    if (raw === undefined || trimmed.length === 0) {
      continue;
    }
    if (parseBooleanFlagValue(trimmed) === null) {
      invalid.push({ key, message: `${key} must be set to "true" or "false".` });
    }
  }

  for (const key of LEGACY_SMTP_KEYS) {
    if (actual[key] !== undefined) {
      warnings.push({
        key,
        message: `${key} is deprecated; migrate to SMTP_URL / MAIL_FROM_* when using smtp.`,
      });
    }
  }

  const extraKeys = Array.from(actualKeys).filter(
    (key) => !exampleKeys.has(key) && !LEGACY_SMTP_KEYS.has(key),
  );

  const normalizedInvalid = dedupeIssues(invalid);
  const normalizedWarnings = dedupeIssues(warnings);
  const missingKeys = Array.from(missing);

  return {
    missingKeys,
    extraKeys,
    invalidKeys: normalizedInvalid,
    warnings: normalizedWarnings,
    appliedDefaults,
    isHealthy: missingKeys.length === 0 && normalizedInvalid.length === 0,
  };
}

function dedupeIssues(issues: EnvIssue[]): EnvIssue[] {
  const seen = new Map<string, EnvIssue>();
  for (const issue of issues) {
    if (!seen.has(issue.key)) {
      seen.set(issue.key, issue);
    }
  }

  return Array.from(seen.values());
}
