import { describe, expect, it } from 'vitest';
import { startOnFreePort } from './server.ts';

const inUse = (port: number) =>
  new Error(`Port ${port} is already in use; stop the other process or pass --port <n>`);

describe('startOnFreePort', () => {
  it('starts on the default port when it is free', async () => {
    const tried: (number | undefined)[] = [];
    const started = await startOnFreePort(async (port) => {
      tried.push(port);
      return `on ${port ?? 'default'}`;
    });

    expect(started).toBe('on default');
    expect(tried).toEqual([undefined]);
  });

  it('moves to the next free port when another project already serves on the default', async () => {
    const tried: (number | undefined)[] = [];
    const started = await startOnFreePort(async (port) => {
      tried.push(port);
      if (port === undefined || port < 4402) throw inUse(port ?? 4400);
      return `on ${port}`;
    });

    expect(started).toBe('on 4402');
    expect(tried).toEqual([undefined, 4401, 4402]);
  });

  it('lets the system pick a port once the nearby ones are all taken', async () => {
    const tried: (number | undefined)[] = [];
    const started = await startOnFreePort(async (port) => {
      tried.push(port);
      if (port !== 0) throw inUse(port ?? 4400);
      return 'on a free port';
    });

    expect(started).toBe('on a free port');
    expect(tried.at(-1)).toBe(0);
    expect(tried).toHaveLength(11);
  });

  it('keeps a port asked for on the command line, and says when it is taken', async () => {
    await expect(
      startOnFreePort(async (port) => {
        throw inUse(port ?? 4400);
      }, 4555),
    ).rejects.toThrow('Port 4555 is already in use');
  });

  it('never retries a failure that is not a taken port', async () => {
    const tried: (number | undefined)[] = [];
    await expect(
      startOnFreePort(async (port) => {
        tried.push(port);
        throw new Error('Not a git repository');
      }),
    ).rejects.toThrow('Not a git repository');
    expect(tried).toEqual([undefined]);
  });
});
