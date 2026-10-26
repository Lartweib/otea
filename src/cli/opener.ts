import { spawn as nodeSpawn } from 'node:child_process';

export type Opener = (url: string) => Promise<void>;

type Child = {
  once(event: 'spawn' | 'error', listener: (error?: Error) => void): unknown;
  unref(): void;
};

type Spawn = (
  command: string,
  args: string[],
  options: { detached: true; stdio: 'ignore' },
) => Child;

export function openCommand(platform: string, url: string): { command: string; args: string[] } {
  if (platform === 'win32')
    return { command: 'rundll32', args: ['url.dll,FileProtocolHandler', url] };
  if (platform === 'darwin') return { command: 'open', args: [url] };
  return { command: 'xdg-open', args: [url] };
}

export function systemOpener(
  platform: string = process.platform,
  spawn: Spawn = nodeSpawn as unknown as Spawn,
): Opener {
  return (url) => {
    const { command, args } = openCommand(platform, url);
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    return new Promise((resolve, reject) => {
      child.once('error', (error) => reject(error));
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    });
  };
}
