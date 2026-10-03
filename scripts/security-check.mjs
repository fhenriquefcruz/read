import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const roots = ['src', 'api', 'public'];
const allowedExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.webmanifest',
  '.html',
  '.css',
  '.svg',
]);

const checks = [
  {
    label: 'fonte de acesso ilícito',
    pattern: /sci-hub|libgen/i,
  },
  {
    label: 'Google API key',
    pattern: /AIza[0-9A-Za-z_-]{20,}/,
  },
  {
    label: 'OpenAI-style secret',
    pattern: /sk-[A-Za-z0-9_-]{20,}/,
  },
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(path)));
    } else if (allowedExtensions.has(extname(entry.name)) || entry.name.endsWith('.webmanifest')) {
      files.push(path);
    }
  }

  return files;
}

let failed = false;

for (const root of roots) {
  for (const file of await walk(root)) {
    const content = await readFile(file, 'utf8');

    for (const check of checks) {
      if (check.pattern.test(content)) {
        console.error(`[security] ${check.label} encontrado em ${file}`);
        failed = true;
      }
    }
  }
}

if (failed) process.exit(1);
console.log('[security] código ativo sem fontes proibidas ou segredos óbvios.');
