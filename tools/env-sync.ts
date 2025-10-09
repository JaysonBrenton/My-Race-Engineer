import { appendFile, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { loadEnvExample, parseEnvFile } from '@/server/config/env-status';

type RunSyncOptions = {
  cwd?: string;
  examplePath?: string;
  envPath?: string;
  output?: Writable;
  now?: Date;
};

type EnvSyncResult = {
  addedKeys: string[];
  backupPath: string;
};

export async function runEnvSync(options: RunSyncOptions = {}): Promise<EnvSyncResult> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const examplePath = resolve(cwd, options.examplePath ?? '.env.example');
  const envPath = resolve(cwd, options.envPath ?? '.env');
  const output = options.output ?? process.stdout;
  const now = options.now ?? new Date();

  const backupPath = `${envPath}.bak-${formatTimestamp(now)}`;

  const example = await loadEnvExample(examplePath);

  let existingContent = '';
  if (existsSync(envPath)) {
    existingContent = await readFile(envPath, 'utf8');
  }

  await writeFile(backupPath, existingContent, 'utf8');

  const envMap = parseEnvFile(existingContent);
  const missingVariables = example.variables.filter((variable) => !envMap.has(variable.key));

  if (missingVariables.length === 0) {
    output.write(
      `⚠️  No new keys to add. Your .env already includes everything from .env.example. Backup: ${backupPath}\n`,
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

  contentToAppend += missingVariables
    .map((variable) => {
      const lines = [] as string[];
      if (variable.leadingComments.length > 0) {
        lines.push(...variable.leadingComments);
      }
      lines.push(`${variable.key}=${variable.value}`);
      return lines.join('\n');
    })
    .join('\n\n');

  if (!contentToAppend.endsWith('\n')) {
    contentToAppend += '\n';
  }

  await appendFile(envPath, contentToAppend, 'utf8');

  output.write(
    `✅ Added ${missingVariables.length} missing key(s): ${missingVariables
      .map((variable) => variable.key)
      .join(', ')}\n`,
  );
  output.write(`📄 Backup created at ${backupPath}\n`);

  return {
    addedKeys: missingVariables.map((variable) => variable.key),
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
  await runEnvSync();
}

if (isCliEntry()) {
  main().catch((error) => {
    console.error('env-sync failed:', error);
    process.exit(1);
  });
}

