import { describe, expect, it } from 'vitest';
import { compileBoard } from './compile.ts';
import { sequenceIds } from './ids.ts';
import { problemsOf } from './problems.ts';
import {
  genericBoard,
  genericState,
  READINGS,
  readBoards,
  readingOf,
  rereadable,
  routeItem,
} from './readings.ts';
import { parseDefinition } from './schema.ts';

// Every state of the presets Otea shipped, and of the boards the earlier reading made of them:
// the facts the migration has to map (the preset files themselves go away).
const OLD_STATES: Readonly<Record<string, readonly (readonly string[])[]>> = {
  tasks: [
    ['incomplete', 'todo', 'in_progress', 'review', 'done', 'discarded', 'todo__review', 'dropped'],
  ],
  'bug-triage': [
    [
      'incomplete',
      'reported',
      'needs_info',
      'accepted',
      'fixing',
      'verify',
      'fixed',
      'rejected',
      'duplicate',
      'wont_fix',
      'accepted__review',
      'dropped',
    ],
  ],
  review: [['queued', 'in_progress', 'review', 'approved', 'dropped', 'queued__review', 'done']],
  architecture: [
    [
      'drafting',
      'review',
      'revising',
      'accepted',
      'rejected',
      'drafting__review',
      'done',
      'dropped',
    ],
  ],
  change: [
    ['analysing', 'plan_review', 'executing', 'verify', 'done', 'discarded'],
    ['proposed', 'ready', 'implementing', 'pr_review', 'revising', 'approved', 'dropped'],
  ],
};

describe('the readings of the shipped presets', () => {
  for (const reading of READINGS) {
    it(`reads ${reading.preset} as boards that publish, keeping every key and mapping every state`, () => {
      const ids = reading.boards.map((_, index) => `b${index}`);
      const defs = readBoards(reading, 'es', ['Mine'], ids);
      expect(defs[0]?.name).toBe('Mine');
      const boards = defs.map((def, index) => ({
        id: ids[index] ?? '',
        name: def.name,
        ...(def.split ? { split: def.split } : {}),
      }));
      defs.forEach((def, index) => {
        expect(parseDefinition(JSON.parse(JSON.stringify(def)))).toEqual({
          ok: true,
          definition: def,
        });
        const errors = problemsOf(def, { agents: [], id: ids[index] ?? '', boards }).filter(
          ({ level }) => level === 'error',
        );
        expect(errors).toEqual([]);
        const preset = compileBoard(ids[index] ?? '', 1, def);
        const states = new Set(preset.workflow.states.map(({ name }) => name));
        for (const old of OLD_STATES[reading.preset]?.[index] ?? []) {
          const to = reading.states[index]?.[old];
          expect(to, `${reading.preset}: ${old}`).toBeDefined();
          expect(states.has(to ?? ''), `${reading.preset}: ${old} → ${to}`).toBe(true);
        }
        expect(def.template).toBe(reading.boards[index]?.template.key);
      });
    });
  }

  it('keeps the field keys and enum values as ids, and starts Priority at medium', () => {
    const reading = readingOf('tasks');
    if (!reading) throw new Error('fixture');
    const [tasks] = readBoards(reading, 'es', ['Tareas'], ['b1']);
    expect(Object.keys(tasks?.parts ?? {})).toEqual(['description', 'priority']);
    expect(tasks?.parts.priority?.options.map(({ id, name }) => `${id}:${name}`)).toEqual([
      'low:Baja',
      'medium:Media',
      'high:Alta',
    ]);
    expect(tasks?.parts.priority?.initial).toBe('medium');
    expect(tasks?.steps.map(({ id, name }) => `${id}:${name}`)).toEqual([
      'incomplete:Completar',
      'todo:Hacerlo',
    ]);
    expect(tasks?.steps[0]).toMatchObject({ skipWhenReady: true, doerMayDrop: true });
  });

  it('reads bug-triage with Falta información merged into Completar, and motives on discard', () => {
    const reading = readingOf('bug-triage');
    if (!reading) throw new Error('fixture');
    const [bugs] = readBoards(reading, 'es', ['Errores'], ['b1']);
    expect(bugs?.steps.map(({ name }) => name)).toEqual(['Completar', 'Triar', 'Arreglar']);
    expect(bugs?.steps[1]?.ways).toEqual(['incomplete']);
    expect(bugs?.steps[2]).toMatchObject({
      ways: ['reported'],
      note: { req: 'always', hint: 'la prueba que hiciste y qué viste' },
    });
    expect(bugs?.drop).toEqual({
      by: 'page',
      motives: [
        { id: 'rejected', name: 'Rechazado' },
        { id: 'duplicate', name: 'Duplicado' },
        { id: 'wont_fix', name: 'No se arreglará' },
      ],
    });
    expect(bugs?.list).toEqual({ as: 'table', group: 'severity' });
    expect(routeItem(reading, { type: 'bug', state: 'needs_info' })).toEqual({
      board: 0,
      state: 'incomplete',
      note: true,
    });
    // A discard the earlier reading folded into Descartado gets its motive back.
    expect(
      routeItem(reading, { type: 'item', state: 'dropped', migratedFrom: 'duplicate' }),
    ).toEqual({ board: 0, state: 'dropped__duplicate', note: false });
    expect(routeItem(reading, { type: 'item', state: 'accepted__review' }).state).toBe(
      'accepted__review',
    );
  });

  it('reads change as Cambios divided into Tareas de repo, always, with the protected branch', () => {
    const reading = readingOf('change');
    if (!reading) throw new Error('fixture');
    const [changes, tasks] = readBoards(reading, 'es', ['Cambios'], ['bcam', 'brt']);
    expect(changes?.split).toEqual({ board: 'brt', always: true });
    expect(changes?.steps[1]?.waits).toEqual(['parts']);
    expect(tasks?.name).toBe('Tareas de repo');
    expect(tasks?.parts.branch?.guard).toEqual({ push: ['implementing'], repo: 'repo' });
    expect(compileBoard('brt', 1, tasks ?? genericBoard('x', 'es', [], [])).workflow.gates).toEqual(
      {
        push: ['implementing'],
        merge: ['done'],
      },
    );
    expect(routeItem(reading, { type: 'repo_task', state: 'ready' })).toEqual({
      board: 1,
      state: 'implementing',
      note: false,
    });
    expect(routeItem(reading, { type: 'change', state: 'verify' })).toEqual({
      board: 0,
      state: 'executing__review',
      note: false,
    });
  });

  it('reads again only a board an earlier reading made and nobody published since', () => {
    expect(rereadable({ liveVersion: 1, publishedBy: 'otea', template: 'tasks' })).toBe(true);
    expect(rereadable({ liveVersion: 2, publishedBy: 'otea', template: 'tasks' })).toBe(false);
    expect(rereadable({ liveVersion: 1, publishedBy: 'human', template: 'tasks' })).toBe(false);
    expect(rereadable({ liveVersion: 1, publishedBy: 'otea', template: 'assets' })).toBe(false);
  });

  it('reads a collection on a preset Otea never shipped as one step that keeps its data', () => {
    const def = genericBoard(
      'Recetas',
      'es',
      ['title', 'ingredients'],
      [{ id: 'photos', module: 'images' }],
      sequenceIds(),
    );
    expect(Object.keys(def.parts)).toEqual(['ingredients', 'photos']);
    expect(def.anytime).toEqual(['ingredients']);
    expect(def.steps[0]?.hand).toEqual([{ ref: 'photos', req: 'no', fresh: false }]);
    expect(() => compileBoard('brec', 1, def)).not.toThrow();
    expect(genericState(def, { state: 'cooking', open: true })).toBe(def.steps[0]?.id);
    expect(genericState(def, { state: 'merged', open: false })).toBe('done');
    expect(genericState(def, { state: 'abandoned', open: false })).toBe('dropped');
  });
});
