import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import {
  evaluateEnvironment,
  loadEnvExample,
  loadEnvFile,
  type EnvDoctorOutcome,
  type EnvIssue,
} from '@/server/config/env-status';

const COLORS = {
  reset: '\u001B[0m',
  bold: '\u001B[1m',
  red: '\u001B[31m',
  green: '\u001B[32m',
  yellow: '\u001B[33m',
};

type RunDoctorOptions = {
  cwd?: string;
  examplePath?: string;
  envPath?: string;
  json?: boolean;
  output?: Writable;
};

type DoctorRunResult = {
  report: EnvDoctorOutcome;
  exitCode: number;
};

export async function runDoctor(options: RunDoctorOptions = {}): Promise<DoctorRunResult> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const examplePath = resolve(cwd, options.examplePath ?? '.env.example');
  const envPath = resolve(cwd, options.envPath ?? '.env');
  const output = options.output ?? process.stdout;
  const emitJson = options.json ?? false;

  const example = await loadEnvExample(examplePath);
  const envMap = await loadEnvFile(envPath);

  const actual: Record<string, string | undefined> = {};
  const actualKeys: string[] = [];
  for (const [key, value] of envMap.entries()) {
    actual[key] = value;
    actualKeys.push(key);
  }

  const report = evaluateEnvironment({
    example,
    actual,
    actualKeys,
  });

  if (emitJson) {
    output.write(
      `${JSON.stringify({
        missingKeys: report.missingKeys,
        extraKeys: report.extraKeys,
        invalidKeys: report.invalidKeys,
        isHealthy: report.isHealthy,
      })}\n`,
    );
    return { report, exitCode: report.isHealthy ? 0 : 1 };
  }

  const table = formatReportTable(report);
  output.write(`${table}\n`);
  output.write(`${formatSummary(report)}\n`);

  return { report, exitCode: report.isHealthy ? 0 : 1 };
}

function formatReportTable(report: EnvDoctorOutcome): string {
  const rows: Array<{ key: string; status: string; details: string }> = [];

  for (const key of report.missingKeys) {
    rows.push({
      key,
      status: `${COLORS.red}missing${COLORS.reset}`,
      details: 'Define this key in your .env file.',
    });
  }

  for (const issue of report.invalidKeys) {
    rows.push({
      key: issue.key,
      status: `${COLORS.red}invalid${COLORS.reset}`,
      details: sanitiseIssueMessage(issue),
    });
  }

  for (const key of report.extraKeys) {
    rows.push({
      key,
      status: `${COLORS.yellow}extra${COLORS.reset}`,
      details: 'Consider removing or documenting this key.',
    });
  }

  if (rows.length === 0) {
    return `${COLORS.green}${COLORS.bold}Environment configuration looks good.${COLORS.reset}`;
  }

  const keyWidth = Math.max('Key'.length, ...rows.map((row) => row.key.length));
  const statusWidth = Math.max('Status'.length, ...rows.map((row) => stripAnsi(row.status).length));

  const header = `${bold('Key'.padEnd(keyWidth))}  ${bold('Status'.padEnd(statusWidth))}  ${bold('Details')}`;
  const divider = `${'-'.repeat(keyWidth)}  ${'-'.repeat(statusWidth)}  ${'-'.repeat(60)}`;
  const body = rows
    .map((row) => {
      const status = row.status.padEnd(statusWidth + (row.status.length - stripAnsi(row.status).length));
      return `${row.key.padEnd(keyWidth)}  ${status}  ${row.details}`;
    })
    .join('\n');

  return `${header}\n${divider}\n${body}`;
}

function formatSummary(report: EnvDoctorOutcome): string {
  if (report.isHealthy) {
    return `${COLORS.green}All required environment keys are present and valid.${COLORS.reset}`;
  }

  const missingPart = report.missingKeys.length > 0
    ? `${report.missingKeys.length} missing`
    : undefined;
  const invalidPart = report.invalidKeys.length > 0
    ? `${report.invalidKeys.length} invalid`
    : undefined;
  const parts = [missingPart, invalidPart].filter(Boolean).join(', ');

  return `${COLORS.red}Environment checks failed (${parts}). Fix the issues above and rerun \`npm run env:doctor\`.${COLORS.reset}`;
}

function sanitiseIssueMessage(issue: EnvIssue): string {
  if (issue.key === 'SESSION_SECRET') {
    return `${issue.message} (value is redacted).`;
  }
  return issue.message;
}

function bold(value: string): string {
  return `${COLORS.bold}${value}${COLORS.reset}`;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*m/g, '');
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
  const json = args.includes('--json');
  const result = await runDoctor({ json });
  process.exit(result.exitCode);
}

if (isCliEntry()) {
  main().catch((error) => {
    console.error('env-doctor failed:', error);
    process.exit(1);
  });
}

