import { afterEach, describe, expect, it } from 'vitest';
import type { BoardDefinition } from '../../../../src/core/board/model.ts';
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
  afterEach(() => setLanguage('en'));

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

  // P4-R2-2: an answer the person gave in the chat, which the agent noted on the question.
  it('says an answer given in the chat was noted by the agent', () => {
    setLanguage('es');
    const human = { kind: 'human', name: 'human' } as const;
    const [line] = historyOf(
      [ev('question_answered', human, { question: 1, text: 'Con musgo', via: 'kiln' }, 2)],
      bug,
      word,
      NOW,
    );
    expect([line?.text, line?.quote, line?.dot]).toEqual([
      'Respondido en el chat, anotado por kiln',
      'Con musgo',
      'relay',
    ]);
  });
});

describe('an option you picked, in the history', () => {
  afterEach(() => setLanguage('en'));

  it('names the option, with your comment as its quote', () => {
    const events = [
      ev('option_chosen', you, { option: 'B', name: 'Cloud backend', comment: 'we sync' }, 3),
      ev('option_chosen', you, { option: 'A', name: 'SQLite' }, 1),
    ];
    expect(historyOf(events, bug, word, NOW).map((l) => [l.text, l.quote, l.dot])).toEqual([
      ['You chose A · SQLite', undefined, 'you'],
      ['You chose B · Cloud backend', 'we sync', 'you'],
    ]);
    setLanguage('es');
    expect(historyOf(events, bug, word, NOW)[0]?.text).toBe('Elegiste A · SQLite');
  });
});

describe('a checklist point proved, in the history', () => {
  afterEach(() => setLanguage('en'));
  const proved = [
    ev(
      'point_proved',
      mender,
      { part: 'checks', point: 'saves', kind: 'log', evidence: 3, file: 'test.log', line: 12 },
      6,
    ),
    ev(
      'point_proved',
      mender,
      { part: 'checks', point: 'loads', kind: 'test', evidence: 4, file: 'junit.xml', test: 'ok' },
      4,
    ),
    ev(
      'point_proved',
      mender,
      { part: 'checks', point: 'looks', kind: 'file', evidence: 5, file: 'after.png' },
      2,
    ),
  ];

  it('says which point, with what proof', () => {
    expect(historyOf(proved, bug, word, NOW).map((l) => [l.text, l.who])).toEqual([
      ['Proved “looks” in checks with after.png', 'Mender'],
      ['Proved “loads” in checks with the test “ok” of junit.xml, which passes', 'Mender'],
      ['Proved “saves” in checks with line 12 of test.log', 'Mender'],
    ]);
  });

  it('says it in Spanish too', () => {
    setLanguage('es');
    expect(historyOf(proved, bug, word, NOW).map((l) => l.text)).toEqual([
      'Probó «looks» en checks con after.png',
      'Probó «loads» en checks con el test «ok» de junit.xml, que pasa',
      'Probó «saves» en checks con la línea 12 de test.log',
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

  afterEach(() => setLanguage('en'));

  // Events written before step names were kept with them carry only the step's id.
  const def = {
    steps: [
      { id: 'sdraw', name: 'Dibujar' },
      { id: 'sink', name: 'Entintar' },
    ],
  } as unknown as BoardDefinition;

  it('reads an event that kept no name by the board’s step of that id', () => {
    const [line] = historyOf(
      [ev('transitioned', mender, { from: 'sdraw', to: 'sink' }, 80)],
      board,
      named,
      NOW,
      def,
    );
    expect(line?.text).toBe('Moved it to Entintar');
  });

  it('says a step since removed, neutrally, when its event kept no name', () => {
    setLanguage('es');
    const lines = historyOf(
      [
        ev('created', you, { state: 'sold' }, 90),
        ev('transitioned', mender, { from: 'sold', to: 'sgone' }, 80),
      ],
      board,
      named,
      NOW,
      def,
    );
    expect(lines.map((l) => l.text)).toEqual([
      'Lo pasó a un paso que ya no existe',
      'Lo creaste en un paso que ya no existe',
    ]);
    setLanguage('en');
    expect(
      historyOf([ev('created', you, { state: 'sold' }, 90)], board, named, NOW, def)[0]?.text,
    ).toBe('You created it in a step since removed');
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
    expect(line?.text).toBe('Actualizaste Severidad (antes: media)');
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

describe('who did what on a board, in the history', () => {
  afterEach(() => setLanguage('en'));
  // Hacer (an agent does it, another agent reviews), Aprobar (you do it), Integrar (an agent lands
  // it, no review), then Hecho.
  const def = {
    steps: [
      { id: 'sdo', name: 'Hacer', doer: 'any', reviewer: 'any' },
      { id: 'sok', name: 'Aprobar', doer: 'you', reviewer: 'none' },
      { id: 'sland', name: 'Integrar', doer: 'any', reviewer: 'none' },
    ],
  } as unknown as BoardDefinition;
  const type = {
    ...bug,
    states: [
      { name: 'sdo', turn: 'agent' },
      { name: 'sdo__review', turn: 'agent' },
      { name: 'sok', turn: 'human' },
      { name: 'sland', turn: 'agent' },
      { name: 'done', turn: 'none', closes: 'done' },
    ],
  } as unknown as typeof bug;
  const named = (s: string) =>
    ({ sdo: 'Hacer', sdo__review: 'Hacer (revisión)', sok: 'Aprobar', sland: 'Integrar' })[s] ?? s;
  const rev = { kind: 'agent', name: 'rev' } as const;
  const events = [
    ev('transitioned', mender, { from: 'sdo', to: 'sdo__review', reason: 'Hecho.' }, 90),
    ev('transitioned', rev, { from: 'sdo__review', to: 'sdo', reason: 'Falta el test.' }, 80),
    ev('transitioned', mender, { from: 'sdo', to: 'sdo__review', reason: 'Con test.' }, 70),
    ev('transitioned', rev, { from: 'sdo__review', to: 'sok' }, 60),
    ev('transitioned', you, { from: 'sok', to: 'sland' }, 50),
    ev('transitioned', mender, { from: 'sland', to: 'done' }, 40),
  ];

  it('says an agent reviewer approved or sent it back, and that you handed off your own step', () => {
    setLanguage('es');
    expect(historyOf(events, type, named, NOW, def).map((l) => [l.text, l.who])).toEqual([
      ['Lo cerró: done', 'Mender'],
      ['Lo entregaste: pasa a Integrar', 'tú'],
      ['Lo aprobó: pasa a Aprobar', 'rev'],
      ['Lo entregó: otro agente revisa Hacer', 'Mender'],
      ['Lo devolvió a Hacer con notas', 'rev'],
      ['Lo entregó: otro agente revisa Hacer', 'Mender'],
    ]);
  });

  it('says it in English too', () => {
    expect(
      historyOf(events, type, named, NOW, def)
        .map((l) => l.text)
        .slice(0, 5),
    ).toEqual([
      'Closed it: done',
      'You handed it off: on to Integrar',
      'Approved it: on to Aprobar',
      'Handed it off: another agent reviews Hacer',
      'Sent it back to Hacer with notes',
    ]);
  });

  it('says your approval with a note as an approval, and your send-back as one', () => {
    setLanguage('es');
    const lines = historyOf(
      [
        ev('transitioned', you, { from: 'sdo__review', to: 'sdo', reason: 'Falta.' }, 30),
        ev('transitioned', you, { from: 'sdo__review', to: 'sland', reason: 'Bien.' }, 20),
      ],
      type,
      named,
      NOW,
      def,
    );
    expect(lines.map((l) => [l.text, l.quote])).toEqual([
      ['Aprobaste: pasa a Integrar', 'Bien.'],
      ['Lo devolviste a Hacer con notas', 'Falta.'],
    ]);
  });

  it('says a Done item was reopened, with why, by an agent or by you', () => {
    setLanguage('es');
    const reopen = { from: 'done', to: 'sdo', reason: 'El PR choca.', reopened: true };
    const lines = historyOf(
      [ev('transitioned', mender, reopen, 30), ev('transitioned', you, reopen, 20)],
      type,
      named,
      NOW,
      def,
    );
    expect(lines.map((l) => [l.text, l.quote])).toEqual([
      ['Lo reabriste y volvió a Hacer', 'El PR choca.'],
      ['Lo reabrió y volvió a Hacer', 'El PR choca.'],
    ]);
  });

  it('says handed again only for a step it was handed in before', () => {
    setLanguage('es');
    const steps = {
      ...bug,
      states: [
        { name: 'sa__review', turn: 'human' },
        { name: 'sb__review', turn: 'human' },
      ],
    } as unknown as typeof bug;
    const lines = historyOf(
      [
        ev('transitioned', mender, { from: 'sa', to: 'sa__review' }, 90),
        ev('transitioned', you, { from: 'sa__review', to: 'sb' }, 80),
        ev('transitioned', mender, { from: 'sb', to: 'sb__review' }, 70),
        ev('transitioned', you, { from: 'sb__review', to: 'sb', reason: 'Otra vez.' }, 60),
        ev('transitioned', mender, { from: 'sb', to: 'sb__review' }, 50),
      ],
      steps,
      word,
      NOW,
    );
    expect(lines.filter((l) => l.who === 'Mender').map((l) => l.text)).toEqual([
      'Lo entregó otra vez en sb__review',
      'Lo entregó en sb__review',
      'Lo entregó en sa__review',
    ]);
  });

  it('says a merge recorded in words, never its event type', () => {
    setLanguage('es');
    const [line] = historyOf(
      [ev('merged', mender, { branch: 'feat/x', pr: 'https://github.com/a/b/pull/3' })],
      type,
      named,
      NOW,
      def,
    );
    expect(line?.text).toBe('Registró que feat/x se fusionó');
  });
});

// An agent that could read neither its model nor its effort read «desconocido · desconocido»
// (UI-23): it says so once.
describe('a profile the agent could not read, in the history', () => {
  it('says it is unknown, once', () => {
    const kiln = { kind: 'agent', name: 'kiln' } as const;
    const declared = { model: 'opus', effort: 'high', harness: 'claude-code' };
    const unread = { model: 'unknown', effort: 'unknown', harness: 'claude-code' };
    const lines = historyOf(
      [
        { ...ev('claimed', kiln, {}, 6), profile: declared },
        { ...ev('released', kiln, {}, 2), profile: unread },
      ] as ItemEvent[],
      bug,
      word,
      NOW,
    );
    expect(lines.map((l) => l.text)).toContain('Switched to unknown');
  });
});
