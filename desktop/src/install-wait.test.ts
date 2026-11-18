import { describe, expect, it } from 'vitest';
import { INSTALLING_STALE_MS, installing, untilInstalled } from './install-wait.ts';

describe('installing', () => {
  it('holds while the installer’s flag is there and recent', () => {
    expect(installing(undefined, 1_000_000)).toBe(false);
    expect(installing(1_000_000, 1_000_000 + 60_000)).toBe(true);
  });

  it('lets go of a flag an installer that failed left behind', () => {
    expect(installing(1_000_000, 1_000_000 + INSTALLING_STALE_MS)).toBe(false);
  });
});

describe('untilInstalled', () => {
  it('goes on at once, saying nothing, when no installer is writing the app', async () => {
    const said: string[] = [];
    await untilInstalled({
      installing: () => false,
      onWaiting: () => said.push('waiting'),
      sleep: async () => {
        said.push('slept');
      },
    });
    expect(said).toEqual([]);
  });

  it('says it waits once, and goes on when the installer is done', async () => {
    let checks = 0;
    const said: string[] = [];
    await untilInstalled({
      installing: () => {
        checks += 1;
        return checks <= 3;
      },
      onWaiting: () => said.push('waiting'),
      sleep: async (ms) => {
        said.push(`slept ${ms}`);
      },
    });
    expect(said).toEqual(['waiting', 'slept 1000', 'slept 1000']);
  });
});
