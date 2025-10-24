import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const EXPECTED_TYPES = ['node', 'react', 'react-dom'];

async function main() {
  try {
    const tsconfigPath = resolve(process.cwd(), 'tsconfig.json');
    const raw = await readFile(tsconfigPath, 'utf8');
    const parsed = JSON.parse(raw);

    const actual = parsed?.compilerOptions?.types;

    if (!Array.isArray(actual)) {
      throw new Error('compilerOptions.types must be defined as an array.');
    }

    const normalized = actual.map((value) => String(value));

    const matches =
      normalized.length === EXPECTED_TYPES.length &&
      EXPECTED_TYPES.every((type, index) => normalized[index] === type);

    if (!matches) {
      throw new Error(
        `compilerOptions.types must exactly equal [${EXPECTED_TYPES.map((type) => `"${type}"`).join(', ')}], but found [${normalized
          .map((type) => `"${type}"`)
          .join(', ')}].`,
      );
    }

    if (process.stdout.isTTY) {
      console.log('tsconfig types guard passed.');
    }
  } catch (error) {
    console.error('tsconfig types guard failed:');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

main();
