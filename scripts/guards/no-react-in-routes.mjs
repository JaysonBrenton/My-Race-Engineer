import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function findRouteFiles(directory) {
  const results = [];
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return results;
    }

    throw error;
  }

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      results.push(...(await findRouteFiles(entryPath)));
    } else if (entry.isFile() && (entry.name === 'route.ts' || entry.name === 'route.tsx')) {
      results.push(entryPath);
    }
  }

  return results;
}

async function main() {
  const root = path.resolve(process.cwd(), 'src/app');
  const routeFiles = await findRouteFiles(root);

  if (routeFiles.length === 0) {
    return;
  }

  const violations = [];

  for (const file of routeFiles) {
    const contents = await readFile(file, 'utf8');

    if (/from\s+['"]react['"]/u.test(contents) || /React\./u.test(contents)) {
      violations.push(path.relative(process.cwd(), file));
    }
  }

  if (violations.length > 0) {
    console.error('React imports or usage are not allowed in route handlers:');
    for (const violation of violations) {
      console.error(` - ${violation}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
