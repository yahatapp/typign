import { cp, copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const directory = await mkdtemp(join(tmpdir(), 'typign-aws-'));
const app = join(directory, 'app');
const artifact = resolve('artifacts/typign.zip');
const pending = `${artifact}.pending`;

async function run(command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: 'inherit' });
  const [code, signal] = await once(child, 'exit');
  if (code !== 0) throw new Error(`${command} failed: ${signal || `exit code ${code}`}`);
}

try {
  await mkdir(app);
  for (const name of ['index.js', 'package.json', 'pnpm-lock.yaml', 'NOTICE', 'rsc', 'ssr', 'client']) {
    await cp(resolve('dist', name), join(app, name), { recursive: true });
  }
  // Keep runtime dependencies inside the ZIP without pnpm's symlink layout.
  await writeFile(join(app, 'pnpm-workspace.yaml'), 'nodeLinker: hoisted\n');
  const installArgs = ['install', '--prod', '--frozen-lockfile', ...(process.argv.includes('--offline') ? ['--offline'] : [])];
  // Use the same Node and pnpm that launched this script, including on Windows.
  const pnpmCli = process.env.npm_execpath;
  if (pnpmCli && basename(pnpmCli).startsWith('pnpm')) {
    await run(process.execPath, [pnpmCli, ...installArgs], app);
  } else {
    await run('pnpm', installArgs, app);
  }
  const archive = join(directory, 'typign.zip');
  await run('zip', ['-q', '-r', archive, '.'], app);
  await mkdir(dirname(artifact), { recursive: true });
  await copyFile(archive, pending);
  await rename(pending, artifact);
  const sha256 = createHash('sha256').update(await readFile(artifact)).digest('hex');
  console.log(`AWS package: ${artifact}\nSHA256: ${sha256}`);
} finally {
  await rm(pending, { force: true });
  await rm(directory, { recursive: true, force: true });
}
