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
};

export type EnvDoctorOutcome = EnvDoctorReport & {
  isHealthy: boolean;
};

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
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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
  } catch (error) {
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
  } catch (error) {
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

export function evaluateEnvironment(options: {
  example: EnvExample;
  actual: Record<string, string | undefined>;
  actualKeys?: Iterable<string>;
}): EnvDoctorOutcome {
  const { example, actual } = options;
  const actualKeys = new Set(options.actualKeys ?? Object.keys(actual));

  const missingKeys: string[] = [];
  const invalidKeys: EnvIssue[] = [];

  const exampleKeys = new Set<string>();

  for (const variable of example.variables) {
    exampleKeys.add(variable.key);
    const actualValue = actual[variable.key];
    if (actualValue === undefined) {
      missingKeys.push(variable.key);
      continue;
    }

    const trimmedValue = actualValue.trim();
    if (trimmedValue.length === 0) {
      invalidKeys.push({ key: variable.key, message: 'Value is empty.' });
      continue;
    }

    if (variable.key === 'APP_URL' && !isAbsoluteUrl(trimmedValue)) {
      invalidKeys.push({ key: variable.key, message: 'APP_URL must be an absolute HTTP(S) URL.' });
    }

    if (variable.key === 'SESSION_SECRET' && !looksLikeSessionSecret(trimmedValue)) {
      invalidKeys.push({ key: variable.key, message: 'SESSION_SECRET must be at least 32 characters long.' });
    }

    if (variable.key === 'ALLOWED_ORIGINS') {
      const origins = splitCsv(trimmedValue);
      if (origins.length === 0) {
        invalidKeys.push({ key: variable.key, message: 'ALLOWED_ORIGINS must list at least one origin.' });
      }
    }
  }

  const extraKeys = Array.from(actualKeys).filter((key) => !exampleKeys.has(key));

  const actualAppUrl = actual.APP_URL ?? '';
  const canonicalAppOrigin = canonicaliseOrigin(actualAppUrl);
  if (canonicalAppOrigin) {
    const allowedOriginsRaw = actual.ALLOWED_ORIGINS;
    if (allowedOriginsRaw !== undefined) {
      const allowedOrigins = splitCsv(allowedOriginsRaw)
        .map(canonicaliseOrigin)
        .filter((origin): origin is string => origin !== null);
      if (!allowedOrigins.includes(canonicalAppOrigin)) {
        invalidKeys.push({
          key: 'ALLOWED_ORIGINS',
          message: 'ALLOWED_ORIGINS should include APP_URL origin.',
        });
      }
    }
  }

  const normalizedInvalid = dedupeIssues(invalidKeys);

  return {
    missingKeys,
    extraKeys,
    invalidKeys: normalizedInvalid,
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

