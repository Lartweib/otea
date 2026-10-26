import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { openCommand, systemOpener } from './opener.ts';

const URL = 'http://127.0.0.1:4400/auth?token=a&b=c';

function fakeSpawn(outcome: 'spawn' | 'error') {
  const unref = vi.fn();
  const spawn = vi.fn(() => {
    const child = Object.assign(new EventEmitter(), { unref });
    queueMicrotask(() => child.emit(outcome, new Error('ENOENT')));
    return child;
  });
  return { spawn, unref };
}

describe('opener', () => {
  it.each([
    ['win32', 'rundll32', ['url.dll,FileProtocolHandler', URL]],
    ['darwin', 'open', [URL]],
    ['linux', 'xdg-open', [URL]],
    ['freebsd', 'xdg-open', [URL]],
  ] as const)('opens the url on %s with %s, without a shell', (platform, command, args) => {
    expect(openCommand(platform, URL)).toEqual({ command, args });
  });

  it('spawns the command detached and lets the process exit without it', async () => {
    const { spawn, unref } = fakeSpawn('spawn');

    await systemOpener('linux', spawn)(URL);

    expect(spawn).toHaveBeenCalledWith('xdg-open', [URL], { detached: true, stdio: 'ignore' });
    expect(unref).toHaveBeenCalled();
  });

  it('rejects when the command cannot be started', async () => {
    const { spawn } = fakeSpawn('error');

    await expect(systemOpener('linux', spawn)(URL)).rejects.toThrow('ENOENT');
  });
});
