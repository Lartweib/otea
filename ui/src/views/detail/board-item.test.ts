import { describe, expect, it } from 'vitest';
import { cambios, creatures, errores, tareasDeRepo } from '../../../../src/core/board/testing.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import type { ItemEvent, RelatedItem } from '../../types.ts';
import {
  approvalRefusal,
  boardItemOf,
  branchStrip,
  linksOf,
  partsCount,
  roundNotes,
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
  it('keeps the handoff note and the person’s send-back reason, round by round', () => {
    const events: ItemEvent[] = [
      created('sfix'),
      said(moved('sfix', 'sfix__review', by, '2026-01-02T00:00:00Z'), 'Probé el muelle.'),
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
    expect(roundNotes(errores(), 'sfill', [created('sfill'), migrate({})])).toEqual([
      { round: 1, notes: [] },
      { round: 2, notes: [] },
    ]);
  });

  it('is one round with nothing to say on a first round', () => {
    expect(roundNotes(errores(), 'sfix', [created('sfix')])).toEqual([{ round: 1, notes: [] }]);
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
