import { describe, expect, it } from 'vitest';
import { cambios, creatures, errores, tareasDeRepo } from '../../../../src/core/board/testing.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { ItemEvent, RelatedItem } from '../../types.ts';
import {
  approvalRefusal,
  backOf,
  boardItemOf,
  branchStrip,
  handRefusal,
  handRows,
  linksOf,
  ownStepOf,
  partsCount,
  roundNotes,
  sheetLook,
  stepRounds,
  waitRows,
} from './board-item.ts';

const words = { done: 'Hecho', dip: (n: number) => `ronda ${n}` };
const agent = (name: string) => ({ kind: 'agent' as const, name });
const you = { kind: 'human' as const, name: 'tú' };
let id = 0;
const created = (state: string, at = '2026-01-01T00:00:00Z'): ItemEvent => ({
  id: ++id,
  type: 'created',
  actor: you,
  at,
  data: { state },
});
const moved = (from: string, to: string, by: ItemEvent['actor'], at: string): ItemEvent => ({
  id: ++id,
  type: 'transitioned',
  actor: by,
  at,
  data: { from, to },
});
const item = (state: string, events: ItemEvent[]) => ({
  state,
  createdAt: '2026-01-01T00:00:00Z',
  events,
});

describe('boardItemOf: the item page reads a published board through the step engine', () => {
  it('names the step’s own agent, not the last agent that moved the item', () => {
    const events = [
      created('sconcept'),
      moved('sconcept', 'sconcept__review', agent('quill'), '2026-01-02T00:00:00Z'),
      moved('sconcept__review', 'sanimate', you, '2026-01-03T00:00:00Z'),
    ];
    const on = boardItemOf(creatures(), item('sanimate', events), words);

    expect(on?.agent).toBe('kiln');
    expect(on?.round).toBe(1);
  });

  it('says no agent for a step any agent may take, and the reviewer during an agent review', () => {
    expect(boardItemOf(creatures(), item('sconcept', [created('sconcept')]), words)?.agent).toBe(
      null,
    );
    expect(
      boardItemOf(creatures(), item('sanimate__review', [created('sconcept')]), words)?.agent,
    ).toBe('scout');
  });

  it('counts the round from a migration as the engine does: its question opens the next round', () => {
    const otea = { kind: 'human' as const, name: 'otea' };
    const reading = (data: Record<string, unknown>): ItemEvent => ({
      ...moved('needs_info', 'sconcept', otea, '2026-01-03T00:00:00Z'),
      data: { from: 'needs_info', to: 'sconcept', reason: 'migrate', ...data },
    });
    const before = [
      created('reported'),
      moved('reported', 'needs_info', you, '2026-01-02T00:00:00Z'),
    ];
    const asked = [...before, reading({ note: '¿Qué versión?' })];
    expect(boardItemOf(creatures(), item('sconcept', asked), words)?.round).toBe(2);
    const plain = [...before, reading({})];
    expect(boardItemOf(creatures(), item('sconcept', plain), words)?.round).toBe(1);
  });

  it('counts the round per step and draws the send-back where it came from', () => {
    const events = [
      created('sconcept'),
      moved('sconcept', 'sconcept__review', agent('quill'), '2026-01-02T00:00:00Z'),
      moved('sconcept__review', 'sconcept', you, '2026-01-03T00:00:00Z'),
      moved('sconcept', 'sconcept__review', agent('quill'), '2026-01-04T00:00:00Z'),
      moved('sconcept__review', 'sanimate', you, '2026-01-05T00:00:00Z'),
    ];
    const atConcept = boardItemOf(creatures(), item('sconcept__review', events.slice(0, 4)), words);
    expect(atConcept?.round).toBe(2);
    expect(atConcept?.route.dips).toEqual([{ at: 1, label: 'ronda 1' }]);

    const atAnimate = boardItemOf(creatures(), item('sanimate', events), words);
    expect(atAnimate?.round).toBe(1);
    // The route's stops are the steps and the reviews on the other lane, never «· revisión» columns.
    expect(atAnimate?.route.words).toEqual(['Concepto', '', 'Animar', 'Pulir', 'Hecho']);
  });

  it('draws a closed item at Hecho, and leaves a state the board does not know to the preset', () => {
    expect(boardItemOf(creatures(), item('done', [created('sconcept')]), words)?.route.ci).toBe(4);
    expect(boardItemOf(creatures(), item('fixing', [created('fixing')]), words)).toBeNull();
  });
});

// ---- what the item page reads of a board item (PLAN §9.1): parts, links, waits, branch, rounds ----

const rel = (
  kind: RelatedItem['kind'],
  rid: string,
  o: Partial<RelatedItem> = {},
): RelatedItem => ({
  kind,
  id: rid,
  collection: 'Tareas de repo',
  type: 'item',
  title: rid,
  state: 'simpl',
  turn: 'agent',
  lease: null,
  ...o,
});
const names = (r: RelatedItem) => ({
  board: r.collection,
  ...(r.closes ? {} : { step: `@${r.state}` }),
});

describe('linksOf: an item’s parts and what holds it back, across boards', () => {
  it('reads them from the item’s relations when the server sends no board block', () => {
    const links = linksOf(
      {
        relations: [
          rel('child', 'RT-4'),
          rel('child', 'RT-5', { closes: 'done', state: 'done', turn: 'none' }),
          rel('blocked_by', 'ERR-2', { collection: 'Errores', state: 'striage' }),
          rel('blocks', 'TAR-3', { collection: 'Tareas' }),
          rel('parent', 'CAM-1', { collection: 'Cambios', state: 'sexec' }),
        ],
      },
      names,
    );
    expect(links.parts.map((p) => `${p.id}:${p.closed}:${p.step ?? ''}`)).toEqual([
      'RT-4:false:@simpl',
      'RT-5:true:',
    ]);
    expect(links.blockers.map((p) => `${p.id}@${p.board}`)).toEqual(['ERR-2@Errores']);
    expect(links.blocking.map((p) => p.id)).toEqual(['TAR-3']);
    expect(links.parent?.id).toBe('CAM-1');
    expect(partsCount(links.parts)).toEqual({ total: 2, open: 1, ended: 1 });
  });

  it('takes the board block’s lists when the server sends them, keeping titles from relations', () => {
    const links = linksOf(
      {
        relations: [rel('child', 'RT-4', { title: 'API' })],
        board: {
          parts: [{ id: 'RT-4', board: 'Tareas de repo', step: 'Implementar', closed: false }],
          partsBoard: 'Tareas de repo',
          blockers: [],
          blocking: [],
          notes: [],
          gates: null,
          branch: null,
        },
      },
      names,
    );
    expect(links.parts).toMatchObject([{ id: 'RT-4', step: 'Implementar', title: 'API' }]);
    expect(links.partsBoard).toBe('Tareas de repo');
  });
});

describe('waitRows: what a step waits for', () => {
  it('lists the open parts and blockers of a step that waits for them', () => {
    const links = linksOf(
      { relations: [rel('child', 'B-2'), rel('blocked_by', 'T-1', { collection: 'Tareas' })] },
      names,
    );
    const rows = waitRows(errores(), 'sfix', links);
    expect(rows.map((r) => `${r.kind}:${r.open.map((x) => x.id).join(',')}/${r.total}`)).toEqual([
      'parts:B-2/1',
      'blockers:T-1/1',
    ]);
    expect(waitRows(errores(), 'striage', links)).toEqual([]);
  });
});

describe('branchStrip: the protected branch where the item stands', () => {
  const def = tareasDeRepo();
  const fields = { fbranch: 'feat/nube', frepo: 'api' };

  it('may be pushed while a push step is done, is frozen in its review, merged at Hecho', () => {
    expect(branchStrip(def, 'simpl', fields)).toEqual({
      tone: 'ok',
      key: 'push',
      value: 'feat/nube',
      repo: 'api',
      step: 'Implementar',
    });
    expect(branchStrip(def, 'simpl__review', fields)?.key).toBe('frozen');
    expect(branchStrip(def, 'done', fields)?.key).toBe('merge');
    expect(branchStrip(def, 'dropped', fields)?.key).toBe('closed');
    expect(branchStrip(def, 'sprop', fields)).toMatchObject({
      tone: 'off',
      key: 'noPush',
      step: 'Propuesta',
    });
  });

  it('is nothing on a board without a protected branch, or before the branch is named', () => {
    expect(branchStrip(creatures(), 'sconcept', fields)).toBeNull();
    expect(branchStrip(def, 'simpl', {})).toBeNull();
  });
});

const said = (e: ItemEvent, reason: string): ItemEvent => ({ ...e, data: { ...e.data, reason } });

describe('roundNotes: each round of the step with its notes', () => {
  const by = agent('mender');
  const handed = (e: ItemEvent, note: string): ItemEvent => ({ ...e, data: { ...e.data, note } });
  it('keeps the handoff note and the person’s send-back reason, round by round', () => {
    const events: ItemEvent[] = [
      created('sfix'),
      handed(moved('sfix', 'sfix__review', by, '2026-01-02T00:00:00Z'), 'Probé el muelle.'),
      said(moved('sfix__review', 'sfix', you, '2026-01-03T00:00:00Z'), 'Sigue cayendo.'),
    ];
    expect(roundNotes(errores(), 'sfix', events)).toEqual([
      {
        round: 1,
        notes: [
          {
            kind: 'handoff',
            text: 'Probé el muelle.',
            by: 'mender',
            person: false,
            at: '2026-01-02T00:00:00Z',
          },
        ],
      },
      {
        round: 2,
        notes: [
          {
            kind: 'back',
            text: 'Sigue cayendo.',
            by: 'tú',
            person: true,
            at: '2026-01-03T00:00:00Z',
          },
        ],
      },
    ]);
  });

  it('starts the next round of Completar with the question Devolver brought', () => {
    const events: ItemEvent[] = [
      created('sfill'),
      said(moved('sfill', 'striage', agent('kiln'), '2026-01-01T12:00:00Z'), 'Completo.'),
      said(moved('striage', 'sfill', you, '2026-01-02T00:00:00Z'), '¿En qué versión?'),
    ];
    expect(roundNotes(errores(), 'sfill', events).at(-1)).toEqual({
      round: 2,
      notes: [
        {
          kind: 'back',
          text: '¿En qué versión?',
          by: 'tú',
          person: true,
          at: '2026-01-02T00:00:00Z',
        },
      ],
    });
  });

  it('counts rounds as the engine does: an item that skipped Completar starts it at round 1', () => {
    const events: ItemEvent[] = [
      created('striage'),
      said(moved('striage', 'sfill', you, '2026-01-02T00:00:00Z'), '¿En qué versión?'),
    ];
    expect(roundNotes(errores(), 'sfill', events)).toEqual([
      {
        round: 1,
        notes: [
          {
            kind: 'back',
            text: '¿En qué versión?',
            by: 'tú',
            person: true,
            at: '2026-01-02T00:00:00Z',
          },
        ],
      },
    ]);
  });

  it('opens no round when the person moves it on, forward, with a word', () => {
    const events: ItemEvent[] = [
      created('sfill'),
      said(moved('sfill', 'striage', agent('kiln'), '2026-01-02T00:00:00Z'), 'Completo.'),
      said(moved('striage', 'sfix', you, '2026-01-03T00:00:00Z'), 'Adelante.'),
    ];
    expect(roundNotes(errores(), 'sfix', events)).toEqual([{ round: 1, notes: [] }]);
  });

  it('reads the question a migration carried as the next round’s note, never the word migrate', () => {
    const otea = { kind: 'human' as const, name: 'otea' };
    const migrate = (data: Record<string, unknown>): ItemEvent => ({
      ...moved('needs_info', 'sfill', otea, '2026-01-03T00:00:00Z'),
      data: { from: 'needs_info', to: 'sfill', reason: 'migrate', ...data },
    });
    expect(
      roundNotes(errores(), 'sfill', [created('sfill'), migrate({ note: '¿Qué versión?' })]),
    ).toEqual([
      { round: 1, notes: [] },
      {
        round: 2,
        notes: [
          { kind: 'back', text: '¿Qué versión?', by: '', person: true, at: '2026-01-03T00:00:00Z' },
        ],
      },
    ]);
    // A reading without a question starts the step afresh, as the engine reads it.
    expect(roundNotes(errores(), 'sfill', [created('sfill'), migrate({})])).toEqual([
      { round: 1, notes: [] },
    ]);
  });

  it('starts at the migration as the engine does: the preset states before it open no round', () => {
    const otea = { kind: 'human' as const, name: 'otea' };
    const at = '2026-01-03T00:00:00Z';
    const events: ItemEvent[] = [
      created('reported'),
      said(moved('reported', 'needs_info', you, '2026-01-02T00:00:00Z'), '¿Qué versión?'),
      {
        ...moved('needs_info', 'sfill', otea, at),
        data: { from: 'needs_info', to: 'sfill', reason: 'migrate', note: '¿Qué versión?' },
      },
    ];
    expect(roundNotes(errores(), 'sfill', events)).toEqual([
      { round: 1, notes: [] },
      {
        round: 2,
        notes: [{ kind: 'back', text: '¿Qué versión?', by: '', person: true, at }],
      },
    ]);
  });

  it('is one round with nothing to say on a first round', () => {
    expect(roundNotes(errores(), 'sfix', [created('sfix')])).toEqual([{ round: 1, notes: [] }]);
  });

  it('opens no round for a send-back the person took back with Deshacer', () => {
    const back = said(moved('sfix__review', 'sfix', you, '2026-01-03T00:00:00Z'), 'Sigue.');
    const undo = {
      ...moved('sfix', 'sfix__review', you, '2026-01-03T00:00:05Z'),
      data: { from: 'sfix', to: 'sfix__review', undoes: back.id },
    };
    const events: ItemEvent[] = [
      created('sfix'),
      handed(moved('sfix', 'sfix__review', by, '2026-01-02T00:00:00Z'), 'Probé el muelle.'),
      back,
      undo,
    ];
    expect(roundNotes(errores(), 'sfix', events).map(({ round }) => round)).toEqual([1]);
  });
});

describe('boardItemOf and Deshacer', () => {
  it('keeps the next step in its first round after an approval taken back and given again', () => {
    const approved = moved('sconcept__review', 'sanimate', you, '2026-01-03T00:00:00Z');
    const events: ItemEvent[] = [
      created('sconcept'),
      moved('sconcept', 'sconcept__review', agent('quill'), '2026-01-02T00:00:00Z'),
      approved,
      {
        ...moved('sanimate', 'sconcept__review', you, '2026-01-03T00:00:05Z'),
        data: { from: 'sanimate', to: 'sconcept__review', undoes: approved.id },
      },
      moved('sconcept__review', 'sanimate', you, '2026-01-03T00:00:09Z'),
    ];
    expect(boardItemOf(creatures(), item('sanimate', events), words)?.round).toBe(1);
  });
});

describe('approvalRefusal: Aprobar refused in words when a wait no longer holds', () => {
  it('names the open parts, or what holds it back', () => {
    setLanguage('es');
    const stepOf: Record<string, string> = { simpl: 'Implementar', sprop: 'Propuesta' };
    const links = linksOf(
      {
        relations: [
          rel('child', 'RT-4', { state: 'simpl' }),
          rel('child', 'RT-5', { state: 'sprop' }),
          rel('blocked_by', 'ERR-2', { collection: 'Errores', state: 'striage' }),
        ],
      },
      (r) => ({ board: r.collection, step: stepOf[r.state] ?? 'Triar' }),
    );
    expect(approvalRefusal('CAM-1', waitRows(cambios(), 'sexec', links))).toBe(
      'No se aprobó CAM-1: RT-4 (Implementar) y RT-5 (Propuesta) siguen sin terminar.',
    );
    expect(approvalRefusal('ERR-1', waitRows(errores(), 'sfix', { ...links, parts: [] }))).toBe(
      'No se aprobó ERR-1: ERR-2 (Errores, Triar) lo frena y sigue sin terminar.',
    );
    expect(approvalRefusal('ERR-1', [])).toBeNull();
    setLanguage('en');
  });
});

describe('sheetLook: open parts are a wait at the handoff, not a look', () => {
  it('reads an item on a board with open parts as queued; every other look stays', () => {
    expect(sheetLook('waiting', true)).toBe('queued');
    expect(sheetLook('working', true)).toBe('working');
    expect(sheetLook('waiting', false)).toBe('waiting');
  });
});

describe('backOf: where a way back lands, in the rounds of the engine', () => {
  it('names the round of the step it starts, and its own agent or none', () => {
    const skipped = item('striage', [created('striage')]);
    expect(backOf(errores(), skipped, 'sfill')).toEqual({ agent: null, round: 1 });
    const twice = item('sfix', [
      created('striage'),
      moved('striage', 'sfix', you, '2026-01-02T00:00:00Z'),
      moved('sfix', 'striage', agent('mender'), '2026-01-03T00:00:00Z'),
      moved('striage', 'sfix', you, '2026-01-04T00:00:00Z'),
    ]);
    expect(backOf(errores(), twice, 'striage')).toEqual({ agent: null, round: 3 });
    expect(backOf(errores(), twice, 'sfix')).toEqual({ agent: 'mender', round: 3 });
  });
});

describe('the person’s own step', () => {
  it('is a step you do while it is being done, not a review or an agent’s step', () => {
    const def = tareasDeRepo();
    expect(ownStepOf(def, { state: 'sprop', turn: 'human' })?.name).toBe('Propuesta');
    expect(ownStepOf(def, { state: 'simpl', turn: 'agent' })).toBeUndefined();
    expect(ownStepOf(def, { state: 'simpl__review', turn: 'human' })).toBeUndefined();
    expect(ownStepOf(def, { state: 'done', turn: 'none' })).toBeUndefined();
  });

  it('lists what it hands, fillable when a field, and refuses Entregar in the page’s words', () => {
    setLanguage('es');
    const def = tareasDeRepo();
    const step = ownStepOf(def, { state: 'sprop', turn: 'human' });
    if (!step) throw new Error('no own step');
    const missing = [{ ref: 'fwhat', name: 'Qué propone', reason: 'missing' }];
    expect(handRows(def, step, missing)).toEqual([
      expect.objectContaining({ ref: 'fwhat', name: 'Qué propone', ok: false, required: true }),
    ]);
    expect(handRows(def, step, missing)[0]?.part?.kind).toBe('long');
    expect(handRefusal('TAR2-1', missing)).toBe('No se entregó TAR2-1: falta Qué propone.');
    expect(handRefusal('TAR2-1', [])).toBeNull();
    expect(handRows(def, step, [])[0]?.ok).toBe(true);
  });
});

describe('stepRounds: the item’s whole history, grouped by step', () => {
  const mender = agent('mender');
  const kiln = agent('kiln');
  const note = (e: ItemEvent, text: string): ItemEvent => ({
    ...e,
    data: { ...e.data, note: text },
  });
  // Completar → Triar (sent back to Completar once) → Triar → Arreglar, sent back once in review.
  const crossed = (): ItemEvent[] => [
    created('sfill'),
    note(moved('sfill', 'striage', kiln, '2026-01-02T00:00:00Z'), 'Completo.'),
    said(moved('striage', 'sfill', you, '2026-01-03T00:00:00Z'), '¿En qué versión?'),
    note(moved('sfill', 'striage', kiln, '2026-01-04T00:00:00Z'), 'La 1.2.'),
    moved('striage', 'sfix', you, '2026-01-05T00:00:00Z'),
    note(moved('sfix', 'sfix__review', mender, '2026-01-06T00:00:00Z'), 'Probé el muelle.'),
    said(moved('sfix__review', 'sfix', you, '2026-01-07T00:00:00Z'), 'Sigue cayendo.'),
    note(moved('sfix', 'sfix__review', mender, '2026-01-08T00:00:00Z'), 'Ya no cae.'),
  ];
  const brief = (groups: ReturnType<typeof stepRounds>) =>
    groups.map(({ step, name, rounds, outcome, current, open }) => ({
      step,
      name,
      count: rounds.length,
      outcome,
      current,
      open,
    }));

  it('lists every step it went through in order, the current one open, earlier ones folded', () => {
    expect(brief(stepRounds(errores(), 'sfix__review', crossed()))).toEqual([
      {
        step: 'sfill',
        name: 'Completar',
        count: 2,
        outcome: { kind: 'reworked' },
        current: false,
        open: false,
      },
      {
        step: 'striage',
        name: 'Triar',
        count: 2,
        outcome: { kind: 'handed' },
        current: false,
        open: false,
      },
      { step: 'sfix', name: 'Arreglar', count: 2, outcome: undefined, current: true, open: true },
    ]);
  });

  it('gives each step its rounds as roundNotes counts them, never counted again', () => {
    const events = crossed();
    for (const group of stepRounds(errores(), 'sfix__review', events))
      expect(group.rounds).toEqual(roundNotes(errores(), group.step, events));
  });

  it('reads an approval from a review as approved, and a way back as sent back to that step', () => {
    const approved = [
      created('sconcept'),
      moved('sconcept', 'sconcept__review', agent('quill'), '2026-01-02T00:00:00Z'),
      moved('sconcept__review', 'sanimate', you, '2026-01-03T00:00:00Z'),
    ];
    expect(stepRounds(creatures(), 'sanimate', approved)[0]?.outcome).toEqual({ kind: 'approved' });
    const back = [
      ...crossed(),
      said(moved('sfix__review', 'striage', you, '2026-01-09T00:00:00Z'), 'Otra categoría.'),
    ];
    // The step it is on comes last: it was entered last.
    expect(brief(stepRounds(errores(), 'striage', back))).toEqual([
      {
        step: 'sfill',
        name: 'Completar',
        count: 2,
        outcome: { kind: 'reworked' },
        current: false,
        open: false,
      },
      {
        step: 'sfix',
        name: 'Arreglar',
        count: 2,
        outcome: { kind: 'back', to: 'Triar' },
        current: false,
        open: false,
      },
      { step: 'striage', name: 'Triar', count: 3, outcome: undefined, current: true, open: true },
    ]);
  });

  it('folds every step of a closed item but its last, which says how it closed', () => {
    const dropped = [
      ...crossed(),
      said(moved('sfix__review', 'dropped__duplicate', you, '2026-01-09T00:00:00Z'), 'Repetido.'),
    ];
    expect(brief(stepRounds(errores(), 'dropped__duplicate', dropped))).toEqual([
      {
        step: 'sfill',
        name: 'Completar',
        count: 2,
        outcome: { kind: 'reworked' },
        current: false,
        open: false,
      },
      {
        step: 'striage',
        name: 'Triar',
        count: 2,
        outcome: { kind: 'handed' },
        current: false,
        open: false,
      },
      {
        step: 'sfix',
        name: 'Arreglar',
        count: 2,
        outcome: { kind: 'dropped' },
        current: false,
        open: true,
      },
    ]);
    const done = [...crossed(), moved('sfix__review', 'done', you, '2026-01-09T00:00:00Z')];
    expect(stepRounds(errores(), 'done', done).at(-1)).toMatchObject({
      step: 'sfix',
      outcome: { kind: 'done' },
      open: true,
    });
  });

  it('is the one step it is on when it never moved, and leaves out a move taken back', () => {
    expect(brief(stepRounds(errores(), 'sfix', [created('sfix')]))).toEqual([
      { step: 'sfix', name: 'Arreglar', count: 1, outcome: undefined, current: true, open: true },
    ]);
    const on = moved('striage', 'sfix', you, '2026-01-03T00:00:00Z');
    const events: ItemEvent[] = [
      created('striage'),
      on,
      {
        ...moved('sfix', 'striage', you, '2026-01-03T00:00:05Z'),
        data: { from: 'sfix', to: 'striage', undoes: on.id },
      },
    ];
    expect(stepRounds(errores(), 'striage', events).map(({ step }) => step)).toEqual(['striage']);
  });
});
