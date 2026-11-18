import { describe, expect, it } from 'vitest';
import { keepDraftThen, sendThenClear } from './note-send.ts';

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

describe('keepDraftThen', () => {
  it('sends a note still in its box before the move, which waits for it (P7-3)', async () => {
    const said: string[] = [];
    const went = await keepDraftThen(
      ' La hoja ',
      async (text) => {
        said.push(`note:${text}`);
        return true;
      },
      () => said.push('move'),
    );
    expect(went).toBe(true);
    expect(said).toEqual(['note:La hoja', 'move']);
  });

  it('moves at once with an empty box, and never when the note failed', async () => {
    const said: string[] = [];
    await keepDraftThen(
      '  ',
      async () => true,
      () => said.push('empty'),
    );
    expect(
      await keepDraftThen(
        'x',
        async () => false,
        () => said.push('failed'),
      ),
    ).toBe(false);
    expect(said).toEqual(['empty']);
  });
});
