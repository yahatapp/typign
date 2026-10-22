import { copyFile, writeFile, readFile } from 'node:fs/promises';
await copyFile('scripts/server.mjs', 'dist/index.js');
await copyFile('NOTICE', 'dist/NOTICE');
await copyFile('pnpm-lock.yaml', 'dist/pnpm-lock.yaml');
const source = JSON.parse(await readFile('package.json', 'utf8'));
await writeFile('dist/package.json', JSON.stringify({ ...source,
  scripts: { start: 'node index.js' } }, null, 2));
