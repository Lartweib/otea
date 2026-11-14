import { describe, expect, it } from 'vitest';
import {
  type ItemNote,
  moment,
  NOTE_ANSWERED,
  NOTE_LEFT,
  type NoteEvent,
  newNotesText,
  notesBlock,
  notesHandLine,
  notesOf,
  notesRefusal,
  repliedText,
  unansweredOf,
  waitNoteText,
} from './notes.ts';

const left = (note: number, at: string, data: Record<string, unknown> = {}): NoteEvent => ({
  type: NOTE_LEFT,
  actor: { kind: 'human', name: 'fede' },
  at,
  data: {
    note,
    text: `nota ${note}`,
    step: 'sdo',
    stepName: 'Hacerlo',
    round: 2,
    delivered: { done: 2, of: 3 },
    channel: 'ui',
    ...data,
  },
});

const answered = (note: number, at: string, by = 'claude-d', extra = {}): NoteEvent => ({
  type: NOTE_ANSWERED,
  actor: { kind: 'agent', name: by },
  at,
  data: { note, text: `respuesta ${note}`, channel: 'cli' },
  ...extra,
});

const note = (n: number, extra: Partial<ItemNote> = {}): ItemNote => ({
  note: n,
  text: `nota ${n}`,
  at: '2026-11-13T13:31:00.000Z',
  by: 'fede',
  step: 'sdo',
  stepName: 'Hacerlo',
  round: 2,
  delivered: { done: 2, of: 3 },
  ...extra,
});

describe('notes from the person, read from the item’s events', () => {
  it('reads each note with its context and its answer, oldest first', () => {
    const events: NoteEvent[] = [
      { type: 'transitioned', actor: { kind: 'agent', name: 'x' }, at: 'z', data: {} },
      left(1, '2026-11-13T13:00:00.000Z', {
        to: 'claude-d',
        anchor: {
          evidence: 7,
          filename: 'pausa.gif',
          part: 'erec',
          partName: 'Grabación',
          seconds: 2,
        },
      }),
      left(2, '2026-11-13T13:10:00.000Z'),
      answered(1, '2026-11-13T13:20:00.000Z', 'claude-d', {
        profile: {
          ...{ harness: 'claude-code', model: 'claude-opus-5-5', effort: 'high' },
          family: 'opus',
        },
      }),
    ];

    expect(notesOf(events)).toEqual([
      {
        note: 1,
        text: 'nota 1',
        at: '2026-11-13T13:00:00.000Z',
        by: 'fede',
        step: 'sdo',
        stepName: 'Hacerlo',
        round: 2,
        delivered: { done: 2, of: 3 },
        to: 'claude-d',
        anchor: {
          evidence: 7,
          filename: 'pausa.gif',
          part: 'erec',
          partName: 'Grabación',
          seconds: 2,
        },
        answer: {
          text: 'respuesta 1',
          at: '2026-11-13T13:20:00.000Z',
          by: 'claude-d',
          profile: { harness: 'claude-code', model: 'claude-opus-5-5', effort: 'high' },
        },
      },
      {
        note: 2,
        text: 'nota 2',
        at: '2026-11-13T13:10:00.000Z',
        by: 'fede',
        step: 'sdo',
        stepName: 'Hacerlo',
        round: 2,
        delivered: { done: 2, of: 3 },
      },
    ]);
    expect(unansweredOf(notesOf(events))).toEqual([2]);
  });
});

describe('what the agent reads of the notes', () => {
  const three = note(3, {
    text: '¿B también cierra el menú desde Controles, o solo vuelve atrás?',
    at: '2026-11-13T13:31:00.000Z',
    anchor: { evidence: 9, filename: 'ui/PauseMenu.tsx', part: 'ediff', partName: 'Diff' },
  });
  const two = note(2, {
    text: 'En el gif el foco salta de Opciones a Salir sin pasar por Controles, ¿es a propósito?',
    anchor: { evidence: 8, filename: 'pausa.gif', part: 'erec', partName: 'Grabación', seconds: 2 },
    answer: { text: 'Sí', at: '2026-11-13T13:22:00.000Z', by: 'claude-d' },
  });

  it('gives next and show every note of the round, newest first, the unanswered whole', () => {
    expect(notesBlock('TAR-7', [two, three], 'claude-d')).toEqual([
      'Notes from the person: 2, 1 unanswered',
      '  3 · "¿B también cierra el menú desde Controles, o solo vuelve atrás?"',
      '      on ui/PauseMenu.tsx · unanswered: otea reply TAR-7 --note 3 "<your short answer>"',
      '  2 · "En el gif el foco salta de Opciones a Salir sin pasar por C…"',
      '      on pausa.gif at 0:02 · you answered 2026-11-13 13:22 UTC',
    ]);
  });

  it('says who answered when it was another agent, and when all are answered', () => {
    const plain = note(1, { answer: { text: 'ok', at: '2026-11-13T13:40:00.000Z', by: 'kiln' } });
    expect(notesBlock('TAR-7', [plain], 'claude-d')).toEqual([
      'Notes from the person: 1, all answered',
      '  1 · "nota 1"',
      '      kiln answered 2026-11-13 13:40 UTC',
    ]);
  });

  it('keeps the three newest answered notes and counts the rest', () => {
    const done = [1, 2, 3, 4, 5].map((n) =>
      note(n, { answer: { text: 'ok', at: '2026-11-13T13:40:00.000Z', by: 'kiln' } }),
    );
    const block = notesBlock('TAR-7', done, 'kiln');
    expect(block[0]).toBe('Notes from the person: 5, all answered');
    expect(block.filter((line) => line.startsWith('  ') && !line.startsWith('      '))).toEqual([
      '  5 · "nota 5"',
      '  4 · "nota 4"',
      '  3 · "nota 3"',
      '  and 2 earlier, answered',
    ]);
  });

  it('gives a heartbeat or an attach the unanswered note, with its moment and how to answer', () => {
    expect(newNotesText('TAR-7', [two, three])).toBe(
      [
        'New note from the person (note 3, unanswered):',
        '  "¿B también cierra el menú desde Controles, o solo vuelve atrás?"',
        '  on ui/PauseMenu.tsx (Diff), 2026-11-13 13:31 UTC, when you had 2 of 3 handoff deliverables',
        'Answer it before you hand off; the step, round and lease stay as they are:',
        '  otea reply TAR-7 --note 3 "<your short answer>"',
      ].join('\n'),
    );
  });

  it('lists several unanswered notes, each with its own command', () => {
    const one = note(1, { delivered: { done: 0, of: 0 }, text: 'línea uno\nlínea dos' });
    expect(newNotesText('TAR-7', [one, three])).toBe(
      [
        'New notes from the person (2 unanswered):',
        '  Note 1: "línea uno',
        '    línea dos"',
        '    2026-11-13 13:31 UTC',
        '  Note 3: "¿B también cierra el menú desde Controles, o solo vuelve atrás?"',
        '    on ui/PauseMenu.tsx (Diff), 2026-11-13 13:31 UTC, when you had 2 of 3 handoff deliverables',
        'Answer each before you hand off; the step, round and lease stay as they are:',
        '  otea reply TAR-7 --note 1 "<your short answer>"',
        '  otea reply TAR-7 --note 3 "<your short answer>"',
      ].join('\n'),
    );
    expect(newNotesText('TAR-7', [two])).toBe('');
  });

  it('adds a line to the Handoff checklist only when the round has notes', () => {
    expect(notesHandLine([])).toEqual([]);
    expect(notesHandLine([two])).toEqual(['  ✓ Notes from the person answered: required']);
    expect(notesHandLine([two, three])).toEqual([
      '  ✗ Notes from the person answered: required (note 3 is not)',
    ]);
    expect(notesHandLine([note(1), two, three])).toEqual([
      '  ✗ Notes from the person answered: required (notes 1 and 3 are not)',
    ]);
  });

  it('refuses a handoff with the unanswered notes and the command that answers them', () => {
    expect(notesRefusal('TAR-7', [3])).toEqual([
      'Not handed off TAR-7: note 3 from the person is unanswered.',
      'Answer it first: otea reply TAR-7 --note 3 "<your short answer>"',
    ]);
    expect(notesRefusal('TAR-7', [1, 2, 3])).toEqual([
      'Not handed off TAR-7: notes 1, 2 and 3 from the person are unanswered.',
      'Answer each first: otea reply TAR-7 --note 1 "<your short answer>" (then --note 2, --note 3)',
    ]);
  });

  it('says what is left after a reply', () => {
    expect(repliedText('TAR-7', 3, [])).toBe(
      'Answered note 3 on TAR-7. Nothing left unanswered: you may hand it off.',
    );
    expect(repliedText('TAR-7', 3, [4])).toBe(
      'Answered note 3 on TAR-7. Still unanswered: note 4 (otea reply TAR-7 --note 4 "<your short answer>").',
    );
  });

  it('wakes a wait with the note and where to read it', () => {
    expect(waitNoteText('TAR-7', [3])).toBe(
      'TAR-7: new note from the person (note 3). Read it: otea show TAR-7',
    );
    expect(waitNoteText('TAR-7', [2, 3])).toBe(
      'TAR-7: new notes from the person (notes 2 and 3). Read them: otea show TAR-7',
    );
  });
});

describe('a moment in a recording', () => {
  it('reads m:ss, with the tenth of a second when there is one', () => {
    expect(moment(2)).toBe('0:02');
    expect(moment(62.4)).toBe('1:02.4');
    expect(moment(0.9)).toBe('0:00.9');
    expect(moment(-3)).toBe('0:00');
  });
});
