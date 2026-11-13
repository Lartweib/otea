import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { connectAgent } from './agents.ts';
import { oteaLauncher, shellLine } from './launcher.ts';

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

  it('pins an MCP server that runs on the desktop app with its environment', () => {
    const root = mkdtempSync(join(tmpdir(), 'otea-launcher-'));
    try {
      const launcher = oteaLauncher(MAIN, { execPath: 'C:\\Otea\\Otea.exe', electron: '45.2.1' });
      connectAgent(root, 'claude-b', launcher);
      const config = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8'));
      expect(config.mcpServers.otea).toEqual({
        command: 'C:\\Otea\\Otea.exe',
        args: [MAIN, 'mcp', '--as', 'claude-b'],
        env: { ELECTRON_RUN_AS_NODE: '1' },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
