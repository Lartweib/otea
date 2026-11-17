import { describe, expect, it } from 'vitest';
import { sendThenClear } from './note-send.ts';

describe('sendThenClear', () => {
  it('clears what was typed once the note went', async () => {
    let cleared = 0;
    expect(
      await sendThenClear(
        async () => true,
        () => cleared++,
      ),
    ).toBe(true);
    expect(cleared).toBe(1);
  });

  it('keeps what was typed when the note was refused or the send failed', async () => {
    let cleared = 0;
    expect(
      await sendThenClear(
        async () => false,
        () => cleared++,
      ),
    ).toBe(false);
    expect(
      await sendThenClear(
        () => Promise.reject(new Error('422')),
        () => cleared++,
      ),
    ).toBe(false);
    expect(cleared).toBe(0);
  });
});
