import { appendFile, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { loadEnvExample, parseBooleanFlagValue, parseEnvFile } from '@/server/config/env-status';

type RunSyncOptions = {
  cwd?: string;
  examplePath?: string;
  envPath?: string;
  output?: Writable;
  now?: Date;
  all?: boolean;
};

type EnvSyncResult = {
  addedKeys: string[];
  backupPath: string;
};

const ALWAYS_REQUIRED_KEYS = new Set([
  'APP_URL',
  'APP_NAME',
  'NEXT_PUBLIC_APP_ORIGIN',
  'ALLOWED_ORIGINS',
  'SESSION_SECRET',
  'COOKIE_SECURE_STRATEGY',
  'TRUST_PROXY',
]);

const LIVERC_FLAG_KEYS = [
  'ENABLE_IMPORT_WIZARD',
  'ENABLE_LIVERC_RESOLVER',
  'ENABLE_IMPORT_FILE',
  'ENABLE_LIVERC_FIXTURE_PROXY',
] as const;

type ShouldAppendContext = {
  key: string;
  env: Map<string, string>;
  includeAll: boolean;
};

function shouldAppendVariable(context: ShouldAppendContext): boolean {
  const { key, env, includeAll } = context;
  if (includeAll) {
    return true;
  }

  if (ALWAYS_REQUIRED_KEYS.has(key)) {
    return true;
  }

  switch (key) {
    case 'TRACING_ENABLED':
      return false;
    case 'OTEL_EXPORTER_OTLP_ENDPOINT':
    case 'OTEL_EXPORTER_OTLP_HEADERS':
    case 'OTEL_SERVICE_NAME':
      return isTracingEnabled(env);
    case 'INGEST_RATE_LIMIT_WINDOW_MS':
    case 'INGEST_RATE_LIMIT_MAX_REQUESTS':
      return isRateLimitingConfigured(env);
    case 'MAILER_DRIVER':
      return false;
    case 'SMTP_URL':
    case 'MAIL_FROM_EMAIL':
    case 'MAIL_FROM_NAME':
      return isMailerSmtp(env);
    case 'LIVERC_HTTP_BASE':
      return isLiveRcEnabled(env);
    default:
      return false;
  }
}

function isTracingEnabled(env: Map<string, string>): boolean {
  return isTruthyFlag(env.get('TRACING_ENABLED'));
}

function isMailerSmtp(env: Map<string, string>): boolean {
  const driver = env.get('MAILER_DRIVER');
  if (!driver) {
    return false;
  }
  return driver.trim().toLowerCase() === 'smtp';
}

function isRateLimitingConfigured(env: Map<string, string>): boolean {
  const window = env.get('INGEST_RATE_LIMIT_WINDOW_MS');
  const max = env.get('INGEST_RATE_LIMIT_MAX_REQUESTS');
  return Boolean(window && window.trim().length > 0) || Boolean(max && max.trim().length > 0);
}

function isLiveRcEnabled(env: Map<string, string>): boolean {
  const wizardRaw = env.get('ENABLE_IMPORT_WIZARD');
  const wizardEnabled = wizardRaw === undefined ? true : isTruthyFlag(wizardRaw);

  if (wizardEnabled) {
    return true;
  }

  return LIVERC_FLAG_KEYS.some((key) => key !== 'ENABLE_IMPORT_WIZARD' && isTruthyFlag(env.get(key)));
}

function isTruthyFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const parsed = parseBooleanFlagValue(value.trim());
  return parsed === true;
}

export async function runEnvSync(options: RunSyncOptions = {}): Promise<EnvSyncResult> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const examplePath = resolve(cwd, options.examplePath ?? '.env.example');
  const envPath = resolve(cwd, options.envPath ?? '.env');
  const output = options.output ?? process.stdout;
  const now = options.now ?? new Date();
  const includeAll = options.all ?? false;

  const backupPath = `${envPath}.bak-${formatTimestamp(now)}`;

  const example = await loadEnvExample(examplePath);

  let existingContent = '';
  if (existsSync(envPath)) {
    existingContent = await readFile(envPath, 'utf8');
  }

  await writeFile(backupPath, existingContent, 'utf8');

  const envMap = parseEnvFile(existingContent);
  const effectiveEnv = new Map(envMap);
  const missingVariables = example.variables.filter((variable) => !envMap.has(variable.key));
  const variablesToAppend = missingVariables.filter((variable) =>
    shouldAppendVariable({ key: variable.key, env: effectiveEnv, includeAll }),
  );

  if (variablesToAppend.length === 0) {
    output.write(
      `⚠️  No feature-dependent keys to add. Use \`npm run env:sync -- --all\` to append every placeholder. Backup: ${backupPath}\n`,
    );
    return { addedKeys: [], backupPath };
  }

  let contentToAppend = '';
  if (existingContent.length > 0) {
    if (!existingContent.endsWith('\n')) {
      contentToAppend += '\n';
    }
    contentToAppend += '\n';
  }

  contentToAppend += variablesToAppend
    .map((variable) => {
      const lines = [] as string[];
      if (variable.leadingComments.length > 0) {
        lines.push(...variable.leadingComments);
      }
      let valueToWrite = variable.value;
      if (variable.key === 'NEXT_PUBLIC_APP_ORIGIN') {
        const appUrl = effectiveEnv.get('APP_URL')?.trim();
        if (appUrl) {
          valueToWrite = appUrl;
        } else {
          lines.push('# Set NEXT_PUBLIC_APP_ORIGIN to match APP_URL for single-origin deployments.');
        }
      }
      lines.push(`${variable.key}=${valueToWrite}`);
      effectiveEnv.set(variable.key, valueToWrite);
      return lines.join('\n');
    })
    .join('\n\n');

  if (!contentToAppend.endsWith('\n')) {
    contentToAppend += '\n';
  }

  await appendFile(envPath, contentToAppend, 'utf8');

  output.write(
    `✅ Added ${variablesToAppend.length} key(s): ${variablesToAppend
      .map((variable) => variable.key)
      .join(', ')}\n`,
  );
  output.write(`📄 Backup created at ${backupPath}\n`);

  return {
    addedKeys: variablesToAppend.map((variable) => variable.key),
    backupPath,
  };
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
}

function isCliEntry() {
  const current = fileURLToPath(import.meta.url);
  const calledWith = process.argv[1];
  if (!calledWith) {
    return false;
  }
  return current === resolve(calledWith);
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  await runEnvSync({ all });
}

if (isCliEntry()) {
  main().catch((error) => {
    console.error('env-sync failed:', error);
    process.exit(1);
  });
}

