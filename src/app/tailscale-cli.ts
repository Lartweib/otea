import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import {
  type Platform,
  parseServeStatus,
  parseStatus,
  type TailscaleCli,
  TailscaleFailure,
} from './tailscale.ts';

// The real tailscale CLI. Only `otea phone tailscale` and Configuración's Tailscale option reach
// `up` and `serve`; tests use tailscale-testing.ts instead.

// Where each system's installer puts the CLI, after whatever PATH finds.
const KNOWN: Record<string, string[]> = {
  win32: ['C:\\Program Files\\Tailscale\\tailscale.exe'],
  darwin: [
    '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
    '/opt/homebrew/bin/tailscale',
    '/usr/local/bin/tailscale',
  ],
  linux: ['/usr/bin/tailscale', '/usr/local/bin/tailscale', '/usr/sbin/tailscale'],
};

export type Locating = {
  platform?: Platform;
  path?: string | undefined;
  exists?: (path: string) => boolean;
};

export function locateTailscale({
  platform = process.platform,
  path = process.env.PATH,
  exists = existsSync,
}: Locating = {}): string | undefined {
  const name = platform === 'win32' ? 'tailscale.exe' : 'tailscale';
  const separator = platform === 'win32' ? ';' : platform === process.platform ? delimiter : ':';
  const onPath = (path ?? '')
    .split(separator)
    .filter((dir) => dir !== '')
    .map((dir) =>
      platform === 'win32' ? `${dir.replace(/[\\/]$/, '')}\\${name}` : join(dir, name),
    );
  return [...onPath, ...(KNOWN[platform] ?? KNOWN.linux ?? [])].find((candidate) =>
    exists(candidate),
  );
}

const TIMEOUT_MS = 30_000;

// What tailscale says when serve is not allowed for this user (Linux, without an operator).
const DENIED = /access denied|permission denied|operator/i;
const LINK = /https:\/\/login\.tailscale\.com\/\S+/;

function run(binary: string, args: string[], timeout = TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout, windowsHide: true }, (error, stdout, stderr) => {
      if (!error) {
        resolve(stdout);
        return;
      }
      const said = `${stderr}\n${stdout}`.trim();
      const link = LINK.exec(said)?.[0];
      const hint = link
        ? ` Open ${link} to allow it on your tailnet, then try again.`
        : DENIED.test(said)
          ? ' On Linux, let your user run it once with: sudo tailscale set --operator=$USER'
          : '';
      reject(
        new TailscaleFailure(
          `tailscale ${args.join(' ')} failed: ${said || error.message}.${hint}`,
        ),
      );
    });
  });
}

function json(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new TailscaleFailure('tailscale answered something that is not JSON');
  }
}

export function systemTailscale(locating: Locating = {}): TailscaleCli {
  const binary = () => {
    const found = locateTailscale(locating);
    if (!found) throw new TailscaleFailure('Tailscale is not installed');
    return found;
  };
  return {
    locate: () => locateTailscale(locating),
    status: async () => parseStatus(json(await run(binary(), ['status', '--json']))),
    serveStatus: async () =>
      parseServeStatus(json(await run(binary(), ['serve', 'status', '--json']))),
    // Interactive: tailscale prints the login link and waits until the person logs in.
    up: () =>
      new Promise((resolve, reject) => {
        const child = spawn(binary(), ['up'], { stdio: 'inherit', windowsHide: true });
        child.once('error', reject);
        child.once('exit', (code) =>
          code === 0 ? resolve() : reject(new TailscaleFailure(`tailscale up exited with ${code}`)),
        );
      }),
    serve: async (port) => {
      await run(binary(), ['serve', '--bg', '--https=443', `http://127.0.0.1:${port}`]);
    },
  };
}
