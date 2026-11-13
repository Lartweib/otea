import { describe, expect, it } from 'vitest';
import {
  addCommand,
  boardCommand,
  createCommand,
  emptyKind,
  firstName,
  routeOf,
} from './empty-states.ts';
import { X } from './lanes/geometry.ts';
import type { Layout, PresetView, Turn } from './types.ts';

const LAYOUT: Layout = {
  header: [],
  evidence: [],
  body: [],
  side: [],
  row: [],
  phone: [],
  intake: [],
};

const items = (...turns: Turn[]) => turns.map((turn) => ({ turn }));

describe('empty states', () => {
  const facts = { collections: 1, collection: 'bugs', byTurn: true };

  it('is the first run with no collection', () => {
    expect(emptyKind({ ...facts, collections: 0, scoped: [] })).toBe('first-run');
  });

  it('is an empty collection, or an empty project under All work', () => {
    expect(emptyKind({ ...facts, scoped: [] })).toBe('empty-collection');
    expect(emptyKind({ ...facts, collections: 2, collection: undefined, scoped: [] })).toBe(
      'empty-project',
    );
  });

  it('is inbox zero when open items wait on agents and none on you', () => {
    expect(emptyKind({ ...facts, scoped: items('agent', 'none') })).toBe('inbox-zero');
    expect(emptyKind({ ...facts, scoped: items('agent', 'human') })).toBeUndefined();
    expect(emptyKind({ ...facts, scoped: items('none') })).toBeUndefined();
    expect(emptyKind({ ...facts, byTurn: false, scoped: items('agent') })).toBeUndefined();
  });

  it('names the first collection of a preset and says how to make it', () => {
    expect(firstName('bug-triage')).toBe('bugs');
    expect(firstName('reviews')).toBe('reviews');
    expect(addCommand('bug-triage')).toBe('otea collection add bugs --preset bug-triage');
    expect(createCommand('bugs', 'What you found')).toBe(
      'otea create --collection bugs --title "What you found"',
    );
  });

  it('points agents at the board they read, quoting a name with spaces', () => {
    expect(boardCommand('Errores')).toBe('otea board Errores');
    expect(boardCommand('Tareas de repo')).toBe('otea board "Tareas de repo"');
  });

  it('lays a preset route down the lanes, each state on its turn', () => {
    const preset: PresetView = {
      name: 'tasks',
      version: 1,
      origin: 'official',
      fields: [],
      view: { kind: 'list', groupBy: 'turn', columns: [] },
      collections: [],
      types: [
        {
          name: 'item',
          label: 'Item',
          initial: 'todo',
          incomplete: 'incomplete',
          fields: [],
          layout: LAYOUT,
          states: [
            { name: 'incomplete', turn: 'agent' },
            { name: 'review', turn: 'human' },
            { name: 'done', turn: 'none', closes: 'done' },
          ],
        },
      ],
    };

    const route = routeOf(preset, 30);

    expect(route.height).toBe(90);
    expect(route.stops).toEqual([
      { name: 'incomplete', x: X.ag, look: 'waiting' },
      { name: 'review', x: X.you, look: 'yours' },
      { name: 'done', x: X.none, look: 'done' },
    ]);
    expect(route.path.startsWith(`M${X.ag} 15 C`)).toBe(true);
  });
});
