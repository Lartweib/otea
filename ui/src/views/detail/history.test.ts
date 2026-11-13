import { afterEach, describe, expect, it } from 'vitest';
import { ago, NOW, officialType } from '../../derive/fixtures.ts';
import { setLanguage } from '../../i18n/i18n.ts';
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

describe('an agent’s question and your answer in the history', () => {
  it('says each, with its words, and moves nothing', () => {
    const kiln = { kind: 'agent', name: 'kiln' } as const;
    const lines = historyOf(
      [
        ev('question_asked', kiln, { question: 1, text: '¿Liso o con musgo?' }, 6),
        ev('question_answered', you, { question: 1, text: 'Con musgo' }, 2),
      ],
      bug,
      word,
      NOW,
    );
    expect(lines.map((l) => [l.text, l.quote, l.who, l.dot])).toEqual([
      ['You answered', 'Con musgo', 'you', 'you'],
      ['Asked you', '¿Liso o con musgo?', 'kiln', 'agent'],
    ]);
  });
});

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

describe('a move the board made in the history', () => {
  afterEach(() => setLanguage('en'));

  it('says a publish moved it, never the word publish as your note', () => {
    const events = [
      ev('transitioned', you, { from: 'gone', to: 'fixing', reason: 'publish', board_version: 3 }),
      ev('transitioned', you, { from: 'verify', to: 'fixed', reason: 'restore', board_version: 2 }),
    ];
    const [restored, published] = historyOf(events, bug, word, NOW);
    expect(published).toMatchObject({ text: 'When v3 was published, it moved to fixing' });
    expect(published?.quote).toBeUndefined();
    expect(restored).toMatchObject({ text: 'When a publish was undone, it went back to fixed' });
    expect(restored?.quote).toBeUndefined();

    setLanguage('es');
    const [back, moved] = historyOf(events, bug, word, NOW);
    expect(moved?.text).toBe('Al publicar v3, pasó a fixing');
    expect(back?.text).toBe('Al deshacer una publicación, volvió a fixed');
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

  it('says what happened before the reading without the preset’s state names', () => {
    const otea = { kind: 'human', name: 'otea' } as const;
    const board = {
      ...bug,
      states: [
        { name: 'sfill', turn: 'agent' },
        { name: 'striage', turn: 'human' },
      ],
    } as unknown as typeof bug;
    const lines = historyOf(
      [
        ev('created', mender, { state: 'reported' }, 90),
        ev(
          'transitioned',
          you,
          { from: 'reported', to: 'needs_info', reason: '¿Qué versión?' },
          80,
        ),
        ev('transitioned', mender, { from: 'needs_info', to: 'fixing' }, 70),
        ev('transitioned', otea, { from: 'fixing', to: 'sfill', reason: 'migrate' }, 60),
      ],
      board,
      word,
      NOW,
    );
    expect(lines.map((l) => l.text)).toEqual([
      'Otea read it onto its board, in sfill',
      'Moved it, before its board',
      'You moved it, before its board',
      'Created it, before its board',
    ]);
    expect(lines[2]?.quote).toBe('¿Qué versión?');
  });
});

describe('a step deleted since', () => {
  const board = {
    ...bug,
    states: [
      { name: 'sdraw', turn: 'agent' },
      { name: 'sdraw:review', turn: 'human' },
    ],
  } as unknown as typeof bug;
  const named = (s: string) => ({ sdraw: 'Dibujar', 'sdraw:review': 'Dibujar (revisión)' })[s] ?? s;

  it('reads by the name its events kept, never its id', () => {
    const lines = historyOf(
      [
        ev('created', you, { state: 'sold', stateName: 'Bocetar' }, 90),
        ev(
          'transitioned',
          mender,
          { from: 'sold', to: 'sold:review', toName: 'Bocetar (revisión)' },
          80,
        ),
      ],
      board,
      named,
      NOW,
    );
    expect(lines.map((l) => l.text)).toEqual([
      'Moved it to Bocetar (revisión)',
      'You created it in Bocetar',
    ]);
  });

  it('reads a step that still stands by its name today', () => {
    const [line] = historyOf(
      [ev('transitioned', mender, { from: 'sdraw', to: 'sdraw:review', toName: 'Old name' }, 80)],
      board,
      named,
      NOW,
    );
    expect(line?.text).toBe('Handed it to you in Dibujar (revisión)');
  });
});

describe('the history of a field change, in the language on screen', () => {
  afterEach(() => setLanguage('en'));

  it('names the field and its old value in the preset’s words, never their keys', () => {
    setLanguage('es');
    const [line] = historyOf(
      [ev('updated', you, { changes: { severity: { from: 'medium', to: 'high' } } })],
      bug,
      word,
      NOW,
    );
    expect(line?.text).toBe('Actualizó Severidad (antes: media)');
  });

  it('says an evidence role in words', () => {
    setLanguage('es');
    const [line] = historyOf(
      [ev('evidence_added', mender, { filename: 'a.png', role: 'before' })],
      bug,
      word,
      NOW,
    );
    expect(line?.text).not.toContain('before');
  });
});

describe('a note to the agent at work, in one line', () => {
  const claude = { kind: 'agent', name: 'claude-d' } as const;
  const left = (note: number, text: string, minutes: number, anchor?: object) =>
    ev(
      'note_left',
      you,
      { note, text, step: 'fixing', stepName: 'Arreglar', round: 2, ...(anchor ? { anchor } : {}) },
      minutes,
    );

  it('says you left it, the note, what it is on and who answered, with a hollow dot', () => {
    setLanguage('es');
    const lines = historyOf(
      [
        left(1, 'En el gif el foco salta.', 30, { evidence: 7, filename: 'pausa.gif' }),
        ev('note_answered', claude, { note: 1, text: 'Visto.' }, 20),
        left(2, '¿B también cierra?', 10),
      ],
      bug,
      word,
      NOW,
    );
    // One line per note, never one for the answer.
    expect(lines).toHaveLength(2);
    const [open, answered] = lines;
    expect(open).toMatchObject({
      dot: 'note',
      text: 'Le dejaste una nota',
      quote: '¿B también cierra?',
    });
    expect(open?.open).toBe(true);
    expect(answered?.dot).toBe('note');
    expect(answered?.open).toBe(false);
    expect(answered?.who).toMatch(/^sobre pausa\.gif · contestó claude-d a las \d\d:\d\d$/);
  });
});
