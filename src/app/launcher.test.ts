import { describe, expect, it } from 'vitest';
import { mcpEntry } from './agents.ts';
import { oteaLauncher, shellLine, withHome } from './launcher.ts';

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
