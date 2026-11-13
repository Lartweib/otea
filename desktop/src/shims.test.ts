// The otea commands the packaged app puts on PATH (bin/otea, bin/otea.cmd), run against a fake app
// laid out as electron-builder lays out the real one, with this Node standing in for the app's
// Electron and a main.ts that prints what it got.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const BIN = fileURLToPath(new URL('../bin/', import.meta.url));
const IS_WIN = process.platform === 'win32';

const ECHO = [
  'const args = process.argv.slice(2);',
  'console.log(JSON.stringify({ args, asNode: process.env.ELECTRON_RUN_AS_NODE }));',
  "process.exit(args.includes('fail') ? 3 : 0);",
].join('\n');

const root = mkdtempSync(join(tmpdir(), 'otea-shims-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

// <app>/<executable> and <app>/<resources>/{bin,otea/src/cli/main.ts}, as the installers leave them.
function fakeApp(executable: string, resources: string): string {
  const app = join(root, `${Math.random()}`.slice(2));
  const res = join(app, resources);
  mkdirSync(join(res, 'bin'), { recursive: true });
  mkdirSync(join(res, 'otea', 'src', 'cli'), { recursive: true });
  writeFileSync(join(res, 'otea', 'src', 'cli', 'main.ts'), ECHO);
  copyFileSync(join(BIN, 'otea'), join(res, 'bin', 'otea'));
  chmodSync(join(res, 'bin', 'otea'), 0o755);
  copyFileSync(join(BIN, 'otea.cmd'), join(res, 'bin', 'otea.cmd'));
  const exe = join(app, executable);
  mkdirSync(join(exe, '..'), { recursive: true });
  try {
    linkSync(process.execPath, exe);
  } catch {
    copyFileSync(process.execPath, exe);
  }
  return res;
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
  const out = result.stdout.trim().split('\n').at(-1) ?? '';
  return { status: result.status, got: out ? JSON.parse(out) : undefined };
}

describe.runIf(IS_WIN)('otea.cmd', () => {
  it('runs the CLI on the app next to it, as Node, with the arguments as given', () => {
    const res = fakeApp('Otea.exe', 'resources');
    const { status, got } = run('cmd.exe', [
      '/d',
      '/c',
      join(res, 'bin', 'otea.cmd'),
      'show',
      'T-1',
    ]);
    expect(status).toBe(0);
    expect(got).toEqual({ args: ['show', 'T-1'], asNode: '1' });
  });

  it('passes the exit code on', () => {
    const res = fakeApp('Otea.exe', 'resources');
    expect(run('cmd.exe', ['/d', '/c', join(res, 'bin', 'otea.cmd'), 'fail']).status).toBe(3);
  });
});

describe.runIf(!IS_WIN)('bin/otea', () => {
  it('finds the Linux app through the /usr/bin symlink the package makes', () => {
    const res = fakeApp('otea-desktop', 'resources');
    const link = join(root, 'usr-bin-otea');
    symlinkSync(join(res, 'bin', 'otea'), link);
    const { status, got } = run(link, ['next', 'with space']);
    expect(status).toBe(0);
    expect(got).toEqual({ args: ['next', 'with space'], asNode: '1' });
  });

  it('finds the Mac app through the /usr/local/bin symlink, and passes the exit code on', () => {
    const res = fakeApp(join('Contents', 'MacOS', 'Otea'), join('Contents', 'Resources'));
    const link = join(root, 'usr-local-bin-otea');
    symlinkSync(join(res, 'bin', 'otea'), link);
    expect(run(link, ['board']).got).toEqual({ args: ['board'], asNode: '1' });
    expect(run(link, ['fail']).status).toBe(3);
  });
});

// Git Bash on Windows runs the same script against Otea.exe.
describe.runIf(IS_WIN)('bin/otea in Git Bash', () => {
  it('runs the Windows app', () => {
    const res = fakeApp('Otea.exe', 'resources');
    const { status, got } = run('sh', [join(res, 'bin', 'otea').replaceAll('\\', '/'), 'next']);
    expect(status).toBe(0);
    expect(got).toEqual({ args: ['next'], asNode: '1' });
  });
});
