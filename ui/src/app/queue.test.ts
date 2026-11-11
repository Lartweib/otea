import { describe, expect, it } from 'vitest';
import { makeQueue } from './queue.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('the data queue', () => {
  it('runs data writes one at a time, in the order they came', async () => {
    const Q = makeQueue();
    const log: string[] = [];
    let release: () => void = () => undefined;
    const first = Q.run(
      () =>
        new Promise<void>((r) => {
          log.push('a starts');
          release = () => {
            log.push('a ends');
            r();
          };
        }),
    );
    const second = Q.run(async () => {
      log.push('b');
    });
    await tick();
    expect(log).toEqual(['a starts']);
    release();
    await Promise.all([first, second]);
    expect(log).toEqual(['a starts', 'a ends', 'b']);
  });

  it('keeps going after a write fails, and hands the failure to its caller', async () => {
    const Q = makeQueue(() => undefined);
    const failed = Q.run(async () => {
      throw new Error('nope');
    });
    const next = Q.run(async () => 'ok');
    await expect(failed).rejects.toThrow('nope');
    await expect(next).resolves.toBe('ok');
  });
});
