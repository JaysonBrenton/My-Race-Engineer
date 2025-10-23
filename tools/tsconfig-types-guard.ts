import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_TYPES = ['node', 'react', 'react-dom', 'react/next', 'react-dom/next'] as const;

type GuardResult = {
  missing: string[];
  hasTypesArray: boolean;
};

async function checkTsconfigTypes(cwd = process.cwd()): Promise<GuardResult> {
  const tsconfigPath = resolve(cwd, 'tsconfig.json');
  const content = await readFile(tsconfigPath, 'utf8');
  const parsed = JSON.parse(content) as {
    compilerOptions?: {
      types?: unknown;
    };
  };

  const typesValue = parsed.compilerOptions?.types;
  if (!Array.isArray(typesValue)) {
    return {
      hasTypesArray: false,
      missing: [...REQUIRED_TYPES],
    };
  }

  const types = typesValue.map(String);
  const missing = REQUIRED_TYPES.filter((type) => !types.includes(type));

  return {
    hasTypesArray: true,
    missing,
  };
}

async function main() {
  try {
    const result = await checkTsconfigTypes();
    if (result.missing.length > 0) {
      console.error(
        [
          'tsconfig guard failed:',
          '',
          'The following ambient type packages must be present in compilerOptions.types to satisfy Next.js route handlers and keep React types available:',
          `  - ${result.missing.join('\n  - ')}`,
          '',
          'Add the missing entries back to tsconfig.json and rerun this command.',
        ].join('\n'),
      );
      process.exit(1);
    }

    if (!result.hasTypesArray) {
      console.error(
        [
          'tsconfig guard failed:',
          '',
          'No compilerOptions.types array was found. Define one that includes:',
          ...REQUIRED_TYPES.map((type) => `  - ${type}`),
        ].join('\n'),
      );
      process.exit(1);
    }

    if (process.stdout.isTTY) {
      console.log('tsconfig types guard passed.');
    }
  } catch (error) {
    console.error('Unable to validate tsconfig.json:', error);
    process.exit(1);
  }
}

const currentModulePath = fileURLToPath(import.meta.url);
const invokedScriptPath = process.argv[1] ? resolve(process.cwd(), process.argv[1]) : undefined;

if (invokedScriptPath && resolve(currentModulePath) === invokedScriptPath) {
  void main();
}

export { checkTsconfigTypes };
