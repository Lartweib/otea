import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mcpEntry } from './agents.ts';
import { oteaLauncher, pathLauncher, shellLine, withHome } from './launcher.ts';

const MAIN = '/opt/Otea/resources/otea/src/cli/main.ts';

describe('oteaLauncher', () => {
  it('runs a checkout with the system Node', () => {
    const launcher = oteaLauncher(MAIN, { execPath: '/usr/bin/node' });
    expect(launcher).toEqual({
      command: 'node',
      args: ['--disable-warning=ExperimentalWarning', MAIN],
    });
    expect(shellLine(launcher)).toBe(`node --disable-warning=ExperimentalWarning "${MAIN}"`);
  });

  // The desktop app runs the CLI on its own Electron, as Node: nothing else needs Node installed.
  it('runs the desktop app own CLI on its Electron, as Node', () => {
    const launcher = oteaLauncher(MAIN, { execPath: '/opt/Otea/otea-desktop', electron: '45.2.1' });
    expect(launcher).toEqual({
      command: '/opt/Otea/otea-desktop',
      args: [MAIN],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    });
    expect(shellLine(launcher)).toBe(`ELECTRON_RUN_AS_NODE=1 "/opt/Otea/otea-desktop" "${MAIN}"`);
  });

  it('gives the MCP server of the desktop app with its environment, pinned to the project', () => {
    const launcher = oteaLauncher(MAIN, { execPath: 'C:\\Otea\\Otea.exe', electron: '45.2.1' });

    expect(mcpEntry(launcher, 'shop-k3x7qa')).toEqual({
      command: 'C:\\Otea\\Otea.exe',
      args: [MAIN, 'mcp', '--project', 'shop-k3x7qa'],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    });
  });

  it('gives a checkout MCP server with no environment, and names no agent', () => {
    const entry = mcpEntry(oteaLauncher(MAIN, { execPath: 'node' }), 'shop-k3x7qa');

    expect(entry).toEqual({
      command: 'node',
      args: ['--disable-warning=ExperimentalWarning', MAIN, 'mcp', '--project', 'shop-k3x7qa'],
    });
    expect(entry.args).not.toContain('--as');
  });

  describe('withHome', () => {
    it('carries an Otea home set apart, quoted in a shell line', () => {
      const launcher = withHome(oteaLauncher(MAIN, { execPath: 'node' }), 'C:\\Otea home');

      expect(launcher.env).toEqual({ OTEA_HOME: 'C:\\Otea home' });
      expect(shellLine(launcher)).toMatch(/^OTEA_HOME="C:\\Otea home" node /);
    });

    it('changes nothing without one', () => {
      const launcher = oteaLauncher(MAIN, { execPath: 'node' });

      expect(withHome(launcher, undefined)).toBe(launcher);
    });
  });
});

// The otea on PATH is what `otea connect` writes into the MCP entry (cli/run.ts oteaOnPath), so
// the entry survives a checkout that moves. Real folders and files: the lookup stats them.
describe('pathLauncher', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'otea-path-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  // A folder on PATH holding the files named.
  const folder = (name: string, ...files: string[]) => {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    for (const file of files) writeFileSync(join(dir, file), '@echo off\r\n');
    return dir;
  };

  describe('on Windows', () => {
    it('starts npm’s otea.cmd shim through cmd /c, found in a folder with spaces', () => {
      const node = folder('Program Files/nodejs', 'node.exe');
      const npm = folder('npm global', 'otea.cmd', 'otea');
      const env = { Path: `${node};${npm}`, PATHEXT: '.com;.exe;.bat;.cmd' };

      const launcher = pathLauncher(env, 'win32');

      expect(launcher).toEqual({ command: 'cmd', args: ['/c', 'otea'] });
      // The entry never names the folder, so its spaces never need quoting.
      expect(launcher && mcpEntry(launcher, 'shop-k3x7qa')).toEqual({
        command: 'cmd',
        args: ['/c', 'otea', 'mcp', '--project', 'shop-k3x7qa'],
      });
    });

    it.each([
      ['otea.bat', 'cmd /c otea', { command: 'cmd', args: ['/c', 'otea'] }],
      ['otea.exe', 'otea', { command: 'otea', args: [] }],
    ])('starts %s as %s', (file, _said, launcher) => {
      const env = { PATH: folder('bin', file), PATHEXT: '.com;.exe;.bat;.cmd' };

      expect(pathLauncher(env, 'win32')).toEqual(launcher);
    });

    it('takes the first folder on PATH, then the first ending PATHEXT lists', () => {
      const shim = folder('first', 'otea.cmd');
      const both = folder('second', 'otea.exe', 'otea.cmd');
      const PATHEXT = '.com;.exe;.bat;.cmd';

      expect(pathLauncher({ PATH: `${shim};${both}`, PATHEXT }, 'win32')?.command).toBe('cmd');
      expect(pathLauncher({ PATH: `${both};${shim}`, PATHEXT }, 'win32')?.command).toBe('otea');
    });

    it('looks for Windows’ usual endings when PATHEXT is unset, in any case', () => {
      const env = { PATH: folder('bin', 'otea.CMD') };

      expect(pathLauncher(env, 'win32')).toEqual({ command: 'cmd', args: ['/c', 'otea'] });
    });

    it('passes over a folder named like the command', () => {
      const decoy = folder('decoy');
      mkdirSync(join(decoy, 'otea.exe'));
      const env = { PATH: `${decoy};${folder('bin', 'otea.cmd')}`, PATHEXT: '.exe;.cmd' };

      expect(pathLauncher(env, 'win32')).toEqual({ command: 'cmd', args: ['/c', 'otea'] });
    });

    it('finds nothing when no otea is on PATH, or there is no PATH', () => {
      const env = { PATH: folder('bin', 'node.exe', 'otea.ps1'), PATHEXT: '.exe;.cmd' };

      expect(pathLauncher(env, 'win32')).toBeUndefined();
      expect(pathLauncher({}, 'win32')).toBeUndefined();
    });
  });

  // A POSIX PATH holds drive-free folders split by ':', and only a file with an execute bit runs.
  describe.skipIf(process.platform === 'win32')('elsewhere', () => {
    const executable = (dir: string, mode: number) => {
      const path = join(dir, 'otea');
      writeFileSync(path, '#!/bin/sh\n');
      chmodSync(path, mode);
      return dir;
    };

    it('runs otea by its name, passing over a file that cannot run', () => {
      const plain = executable(folder('plain'), 0o644);
      const linked = executable(folder('npm global/bin'), 0o755);

      expect(pathLauncher({ PATH: `${plain}:${linked}` }, 'linux')).toEqual({
        command: 'otea',
        args: [],
      });
      expect(pathLauncher({ PATH: plain }, 'linux')).toBeUndefined();
    });

    it('never takes a Windows shim', () => {
      const env = { PATH: folder('bin', 'otea.cmd'), PATHEXT: '.cmd' };

      expect(pathLauncher(env, 'darwin')).toBeUndefined();
    });
  });
});
