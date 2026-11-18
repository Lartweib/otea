import { describe, expect, it } from 'vitest';
import type { Agent } from '../../presence.ts';
import type { Item } from '../../types.ts';
import type { BoardSummary } from '../api.ts';
import {
  arrivedDrafts,
  blockJoins,
  draftersOf,
  freeName,
  freshlyLive,
  homeRows,
  joinsMap,
  nameIssue,
  setBoards,
  shownBoards,
  statusOf,
} from './home-model.ts';

describe('the boards Tus tableros lists', () => {
  const pedidos = (over: Partial<BoardSummary> = {}) =>
    ({
      id: 'breq',
      name: 'Pedidos',
      builtin: true,
      collection: 'Pedidos',
      ...over,
    }) as BoardSummary;
  const own = { id: 'b2', name: 'Errores', builtin: false, collection: 'Errores' } as BoardSummary;

  it('leaves out Pedidos while it holds no item, as the places do', () => {
    expect(shownBoards([pedidos(), own], []).map(({ name }) => name)).toEqual(['Errores']);
    const asked = { id: 'PED-1', collection: 'Pedidos' } as Item;
    expect(shownBoards([pedidos(), own], [asked]).map(({ name }) => name)).toEqual([
      'Pedidos',
      'Errores',
    ]);
  });
});

describe('who may draft a board', () => {
  const at = '2026-11-17T12:00:00.000Z';
  const profile = { harness: 'claude-code', model: 'opus', effort: 'high', family: 'claude' };
  const agent = (name: string, lastSeen: string, live = false, declared = true) =>
    ({
      name,
      lastSeen,
      live,
      harness: null,
      holding: [],
      profile: declared ? profile : null,
    }) as Agent;

  it('offers the agents connected now or seen in the last hour, the ones here now first', () => {
    const agents = [
      agent('old', '2026-10-01T10:00:00.000Z'),
      agent('kiln', '2026-11-17T10:30:00.000Z'),
      agent('quill', '2026-11-17T11:00:00.000Z', true),
      agent('scout', '2026-11-17T11:40:00.000Z'),
      agent('held', '2026-11-16T09:00:00.000Z', true),
    ];
    expect(draftersOf(agents, at)).toEqual(['quill', 'held', 'scout']);
  });

  it('never offers an agent Otea refuses work from: one that declared no profile', () => {
    const agents = [
      agent('quill', '2026-11-17T11:50:00.000Z'),
      agent('nameless', '2026-11-17T11:55:00.000Z', true, false),
    ];
    expect(draftersOf(agents, at)).toEqual(['quill']);
  });

  it('offers at most eight', () => {
    const many = Array.from({ length: 12 }, (_, n) =>
      agent(`a${n}`, `2026-11-17T11:${String(10 + n).padStart(2, '0')}:00.000Z`),
    );
    expect(draftersOf(many, at)).toHaveLength(8);
  });
});

// What Studio's home decides without drawing: a board's status in words, a free name for a copy,
// the checks of a new board's name, the drafts an agent just delivered, and the boards the rail
// has not shown before.

const summary = (over: Partial<BoardSummary>): BoardSummary =>
  ({
    id: 'b1',
    name: 'Recursos',
    item: 'Criatura',
    icon: 'layers',
    builtin: false,
    status: 'live',
    liveVersion: 3,
    collection: 'Recursos',
    open: 0,
    requestItem: null,
    definition: {} as BoardSummary['definition'],
    ...over,
  }) as BoardSummary;

describe('a board’s status', () => {
  it('is its published version when nothing waits to be published', () => {
    expect(statusOf(summary({ status: 'live', liveVersion: 3 }))).toEqual({
      kind: 'live',
      version: 3,
    });
  });

  it('adds the unpublished changes to a published board', () => {
    expect(statusOf(summary({ status: 'changed', liveVersion: 2 }))).toEqual({
      kind: 'changed',
      version: 2,
    });
  });

  it('is a draft before its first publish', () => {
    expect(statusOf(summary({ status: 'draft', liveVersion: null }))).toEqual({ kind: 'draft' });
  });

  it('names the agent drafting it, when it is known', () => {
    expect(statusOf(summary({ status: 'waiting' }), 'kiln')).toEqual({
      kind: 'waiting',
      agent: 'kiln',
    });
    expect(statusOf(summary({ status: 'waiting' }))).toEqual({ kind: 'waiting', agent: null });
  });
});

describe('a free name', () => {
  it('is the name itself while no board has it, whatever the case', () => {
    expect(freeName('Recursos de juego', ['Errores'])).toBe('Recursos de juego');
  });

  it('counts up past the names taken', () => {
    expect(freeName('Bugs', ['bugs', 'Bugs 2'])).toBe('Bugs 3');
  });
});

describe('a new board’s name', () => {
  it('needs some text', () => {
    expect(nameIssue('   ', [])).toBe('empty');
  });

  it('is taken when a board has it already, whatever the case and spacing', () => {
    expect(nameIssue('  criaturas   del pantano ', ['Criaturas del pantano'])).toBe('taken');
  });

  it('is fine otherwise', () => {
    expect(nameIssue('Criaturas', ['Errores'])).toBeNull();
  });
});

describe('drafts that arrive', () => {
  it('are the boards that waited for an agent and no longer do', () => {
    const before = [
      summary({ id: 'a', status: 'waiting' }),
      summary({ id: 'b', status: 'waiting' }),
    ];
    const after = [summary({ id: 'a', status: 'draft' }), summary({ id: 'b', status: 'waiting' })];

    expect(arrivedDrafts(before, after).map((b) => b.id)).toEqual(['a']);
  });

  it('are none on the first read', () => {
    expect(arrivedDrafts(null, [summary({ status: 'draft' })])).toEqual([]);
  });
});

describe('boards published since the last read', () => {
  it('are the collections of boards live now that were not live before', () => {
    const before = [
      summary({ id: 'a', status: 'draft', collection: null }),
      summary({ id: 'b', status: 'live', collection: 'Errores' }),
    ];
    const after = [
      summary({ id: 'a', status: 'live', collection: 'Criaturas' }),
      summary({ id: 'b', status: 'changed', collection: 'Errores' }),
      summary({ id: 'c', status: 'live', collection: 'Notas' }),
    ];

    expect(freshlyLive(before, after)).toEqual(['Criaturas', 'Notas']);
  });

  it('are none on the first read', () => {
    expect(freshlyLive(null, [summary({ status: 'live' })])).toEqual([]);
  });
});

// Boards that work together: a split pair is one row (at the parent's place), the boards a set
// made together without a split name each other, and the joins map lists every split.
const def = (over: Record<string, unknown> = {}) =>
  ({ name: 'x', item: 'x', steps: [], ...over }) as unknown as BoardSummary['definition'];

describe('the rows of your boards', () => {
  const boards = [
    summary({ id: 'tasks', name: 'Tareas', definition: def({ madeWith: ['bugs'] }) }),
    summary({ id: 'rt', name: 'Tareas de repo', definition: def({ madeWith: ['ch'] }) }),
    summary({
      id: 'ch',
      name: 'Cambios',
      definition: def({ split: { board: 'rt', always: true }, madeWith: ['rt'] }),
    }),
    summary({ id: 'bugs', name: 'Errores', definition: def({ madeWith: ['tasks'] }) }),
    summary({ id: 'solo', name: 'Notas', definition: def() }),
  ];

  it('draws a joined pair once, where the first of its two boards stands', () => {
    const rows = homeRows(boards);
    expect(
      rows.map((r) => (r.kind === 'pair' ? `${r.parent.id}>${r.child.id}` : r.board.id)),
    ).toEqual(['tasks', 'ch>rt', 'bugs', 'solo']);
  });

  it('names the boards made together that stay apart', () => {
    const rows = homeRows(boards);
    const tasks = rows[0];
    expect(tasks?.kind === 'one' ? tasks.madeWith : null).toEqual(['Errores']);
    const solo = rows[3];
    expect(solo?.kind === 'one' ? solo.madeWith : null).toEqual([]);
  });

  it('says whether each part always belongs to its parent', () => {
    const pair = homeRows(boards)[1];
    expect(pair?.kind === 'pair' ? pair.always : null).toBe(true);
  });
});

describe('the joins map', () => {
  it('lists every board that divides into another, and nothing else', () => {
    const boards = [
      summary({
        id: 'ch',
        name: 'Cambios',
        definition: def({ split: { board: 'rt', always: true } }),
      }),
      summary({ id: 'rt', name: 'Tareas de repo', definition: def() }),
      summary({
        id: 'self',
        name: 'Ideas',
        definition: def({ split: { board: 'same', always: false } }),
      }),
    ];
    expect(joinsMap(boards).map((j) => `${j.parent.name}>${j.child.name}:${j.always}`)).toEqual([
      'Cambios>Tareas de repo:true',
    ]);
  });

  it('adds, from today’s links, a board whose open items hold back another board’s', () => {
    const boards = [
      summary({ id: 'er', name: 'Errores', collection: 'Errores', definition: def() }),
      summary({ id: 'ta', name: 'Tareas', collection: 'Tareas', definition: def() }),
    ];
    const open = (id: string, collection: string, relations: Item['relations'] = []) =>
      ({ id, collection, relations }) as Item;
    const items = [
      open('ERR-214', 'Errores', [{ kind: 'blocks', id: 'TAR-3' }]),
      open('ERR-215', 'Errores', [{ kind: 'blocks', id: 'TAR-4' }]),
      open('ERR-216', 'Errores', [{ kind: 'blocks', id: 'ERR-1' }]),
      open('TAR-3', 'Tareas'),
      open('TAR-4', 'Tareas'),
      open('ERR-1', 'Errores'),
      { ...open('ERR-9', 'Errores', [{ kind: 'blocks', id: 'TAR-3' }]), closes: 'done' } as Item,
    ];
    expect(blockJoins(boards, items)).toEqual([
      { from: boards[0], to: boards[1], blocker: 'ERR-214', blocked: 'TAR-3' },
    ]);
    expect(blockJoins(boards, [])).toEqual([]);
  });

  it('is empty when no board divides into another', () => {
    expect(joinsMap([summary({ definition: def() })])).toEqual([]);
  });
});

describe('a template that makes several boards', () => {
  const view = (over: Record<string, unknown>) =>
    ({ key: 'k', icon: 'board', name: 'n', description: 'd', definition: def(), ...over }) as never;

  it('lists each board it makes with what each item is called', () => {
    const boards = [
      { name: 'Cambios', item: 'Cambio', definition: def() },
      { name: 'Tareas de repo', item: 'Tarea de repo', definition: def() },
    ];
    expect(setBoards(view({ boards }))?.map((b) => `${b.name}/${b.item}`)).toEqual([
      'Cambios/Cambio',
      'Tareas de repo/Tarea de repo',
    ]);
  });

  it('is no set when it makes one board', () => {
    expect(setBoards(view({}))).toBeNull();
    expect(setBoards(view({ boards: [{ name: 'a', item: 'b', definition: def() }] }))).toBeNull();
  });
});
