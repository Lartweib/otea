import { describe, expect, it } from 'vitest';
import { ago, NOW, officialType } from '../../derive/fixtures.ts';
import type { ItemEvent } from '../../types.ts';
import { historyOf } from './history.ts';

const bug = officialType('bug-triage');
let seq = 0;
const ev = (
  type: string,
  actor: ItemEvent['actor'],
  data: Record<string, unknown>,
  minutes = 10,
): ItemEvent => ({ id: ++seq, type, actor, at: ago(minutes), data });
const mender = { kind: 'agent', name: 'Mender' } as const;
const you = { kind: 'human', name: 'fede' } as const;
const word = (s: string) => s;

describe('the history, newest first, in words', () => {
  const events = [
    ev('created', { kind: 'agent', name: 'Scout' }, { state: 'reported' }, 900),
    ev('transitioned', you, { from: 'reported', to: 'accepted' }, 800),
    ev('claimed', mender, { holder: 'Mender' }, 750),
    ev('transitioned', mender, { from: 'fixing', to: 'verify', reason: 'Lo probé.' }, 600),
    ev('transitioned', you, { from: 'verify', to: 'fixing', reason: 'El último se queda.' }, 500),
    ev('transitioned', mender, { from: 'fixing', to: 'verify', reason: 'Ya cruzan.' }, 14),
    ev('transitioned', mender, { from: 'verify', to: 'fixed', via: 'Kiln', quote: 'dale' }, 2),
  ];
  const lines = historyOf(events, bug, word, NOW);

  it('lists newest first, each with who, its dot and its words', () => {
    expect(lines.map((l) => [l.text, l.who, l.dot])).toEqual([
      ['Kiln passed on your decision: fixed', 'you', 'relay'],
      ['Handed it to you again in verify', 'Mender', 'agent'],
      ['You sent it back to fixing with notes', 'you', 'you'],
      ['Handed it to you in verify', 'Mender', 'agent'],
      ['Took the lease', 'Mender', 'agent'],
      ['You approved: on to accepted', 'you', 'you'],
      ['Created it in reported', 'Scout', 'agent'],
    ]);
  });

  it('quotes what was said', () => {
    expect(lines.map((l) => l.quote ?? null)).toEqual([
      'dale',
      'Ya cruzan.',
      'El último se queda.',
      'Lo probé.',
      null,
      null,
      null,
    ]);
  });

  it('says a close and a discard as yours', () => {
    const [closed] = historyOf(
      [ev('transitioned', you, { from: 'verify', to: 'fixed' })],
      bug,
      word,
      NOW,
    );
    const [dropped] = historyOf(
      [ev('transitioned', you, { from: 'reported', to: 'rejected', reason: 'no' })],
      bug,
      word,
      NOW,
    );
    expect(closed?.text).toBe('You closed it: fixed');
    expect(dropped?.text).toBe('You discarded it: rejected');
  });

  it('dates today by its time, earlier days by their word', () => {
    expect(lines[1]?.when).toMatch(/^today \d\d:\d\d$/);
    expect(lines.at(-1)?.when).toMatch(/^today|yesterday/);
  });
});

describe('the history of a stuck item you took in hand', () => {
  const kiln = { kind: 'agent', name: 'kiln' } as const;
  const lines = historyOf(
    [
      ev('claimed', kiln, { holder: 'kiln' }, 60),
      ev('released', you, { holder: 'kiln', cause: 'restart' }, 5),
      ev('released', you, { holder: 'kiln', cause: 'reassign', next: 'quill' }, 3),
    ],
    bug,
    word,
    NOW,
  );

  it('says you put it back in the queue, or whom you left it for', () => {
    expect(lines.map((l) => [l.text, l.who, l.dot])).toEqual([
      ['You left it for quill', 'you', 'you'],
      ['You put it back in the queue', 'you', 'you'],
      ['Took the lease', 'kiln', 'agent'],
    ]);
  });
});

describe('a board reading in the history', () => {
  it('says Otea read the item onto its board, with the question it carried, never the word migrate', () => {
    const otea = { kind: 'human', name: 'otea' } as const;
    const [asked, plain] = historyOf(
      [
        ev('transitioned', otea, { from: 'fixing', to: 'sfix', reason: 'migrate' }, 20),
        ev(
          'transitioned',
          otea,
          { from: 'needs_info', to: 'sfill', reason: 'migrate', note: '¿Qué versión?' },
          10,
        ),
      ],
      bug,
      word,
      NOW,
    );
    expect(asked).toMatchObject({
      text: 'Otea read it onto its board, in sfill',
      who: 'Otea',
      dot: 'agent',
      quote: '¿Qué versión?',
    });
    expect(plain).toMatchObject({ text: 'Otea read it onto its board, in sfix', who: 'Otea' });
    expect(plain?.quote).toBeUndefined();
  });
});
