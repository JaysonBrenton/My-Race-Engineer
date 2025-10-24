import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_TYPES = ['node', 'react', 'react-dom'] as const;

type GuardResult = {
  hasTypesArray: boolean;
  matchesRequiredOrder: boolean;
  actual: string[];
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
      matchesRequiredOrder: false,
      actual: [],
    };
  }

  const types = typesValue.map(String);
  const matchesRequiredOrder =
    types.length === REQUIRED_TYPES.length &&
    REQUIRED_TYPES.every((type, index) => types[index] === type);

  return {
    hasTypesArray: true,
    matchesRequiredOrder,
    actual: types,
  };
}

async function main() {
  try {
    const result = await checkTsconfigTypes();
    if (!result.hasTypesArray) {
      console.error(
        [
          'tsconfig guard failed:',
          '',
          'No compilerOptions.types array was found. Define one that exactly equals:',
          `  [${REQUIRED_TYPES.map((type) => `"${type}"`).join(', ')}]`,
        ].join('\n'),
      );
      process.exit(1);
    }

    if (!result.matchesRequiredOrder) {
      console.error(
        [
          'tsconfig guard failed:',
          '',
          'compilerOptions.types must exactly equal ["node", "react", "react-dom"] to lock in the simplified ambient type set.',
          `Found: [${result.actual.map((type) => `"${type}"`).join(', ')}]`,
          '',
          'Update tsconfig.json and rerun this command.',
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
