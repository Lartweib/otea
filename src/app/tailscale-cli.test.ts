import { describe, expect, it } from 'vitest';
import { locateTailscale } from './tailscale-cli.ts';

// Only finding the CLI is tested here: running it would read or change this computer's network.
describe('finding the tailscale CLI', () => {
  const only = (path: string) => (candidate: string) => candidate === path;

  it('takes the one on PATH first', () => {
    expect(
      locateTailscale({
        platform: 'linux',
        path: '/home/me/bin:/usr/bin',
        exists: (candidate) => candidate.endsWith('tailscale'),
      }),
    ).toMatch(/home[\\/]me[\\/]bin[\\/]tailscale$/);
  });

  it('finds Windows’ installer path without PATH', () => {
    const exe = 'C:\\Program Files\\Tailscale\\tailscale.exe';
    expect(locateTailscale({ platform: 'win32', path: '', exists: only(exe) })).toBe(exe);
    expect(
      locateTailscale({
        platform: 'win32',
        path: 'C:\\Tools\\',
        exists: only('C:\\Tools\\tailscale.exe'),
      }),
    ).toBe('C:\\Tools\\tailscale.exe');
  });

  it('finds the macOS app’s CLI and Linux’s packages', () => {
    const app = '/Applications/Tailscale.app/Contents/MacOS/Tailscale';
    expect(locateTailscale({ platform: 'darwin', path: '', exists: only(app) })).toBe(app);
    expect(
      locateTailscale({ platform: 'linux', path: '', exists: only('/usr/sbin/tailscale') }),
    ).toBe('/usr/sbin/tailscale');
  });

  it('finds nothing when it is not installed', () => {
    expect(locateTailscale({ platform: 'linux', path: '/usr/bin', exists: () => false })).toBe(
      undefined,
    );
  });
});
