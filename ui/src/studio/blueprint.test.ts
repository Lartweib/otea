import { describe, expect, it } from 'vitest';
import type { PresetView, TypeView } from '../types.ts';
import {
  blockLoops,
  layoutBoxes,
  linkPaths,
  readBlueprintDraft,
  readingsFor,
  shapesOf,
} from './blueprint.ts';

const type = (name: string, states: Array<{ name: string; requires?: string[] }>): TypeView =>
  ({
    name,
    label: name,
    initial: states[0]?.name ?? '',
    states: states.map((state) => ({ turn: 'agent', ...state })),
    fields: [],
    layout: {},
  }) as unknown as TypeView;

const preset = (name: string, types: TypeView[]): PresetView =>
  ({
    name,
    version: 1,
    origin: 'official',
    fields: [],
    types,
    view: {},
    collections: [],
  }) as unknown as PresetView;

const PRESETS = [
  preset('agile', [
    type('story', [{ name: 'todo' }, { name: 'in_progress', requires: ['blockers_closed'] }]),
    type('epic', [{ name: 'review', requires: ['children_closed'] }]),
  ]),
  preset('triage', [type('bug', [{ name: 'open' }])]),
];

const BOARDS = [
  { name: 'work', preset: 'agile' },
  { name: 'bugs', preset: 'triage' },
  { name: 'art', preset: 'triage' },
];

describe('reading a blueprint draft', () => {
  it('reads links with the core and checks their types against the presets', () => {
    const read = readBlueprintDraft(
      'studio',
      {
        boards: BOARDS,
        connections: ['bugs.bug blocks work.story', 'art.bug relates work.chapter'],
        playbook: null,
      },
      PRESETS,
    );

    expect(read.connections).toHaveLength(2);
    expect(read.problems).toEqual([
      'connections[1]: board work (preset agile) has no type "chapter" (types: story, epic)',
    ]);
  });

  it('refuses a parent link between boards, as the core does', () => {
    const read = readBlueprintDraft(
      'studio',
      { boards: BOARDS, connections: ['bugs.bug parent work.story'], playbook: null },
      PRESETS,
    );

    expect(read.problems[0]).toContain('parent links stay inside one board');
  });
});

describe('who waits for whom', () => {
  const shapes = new Map(
    BOARDS.map((board) => [
      board.name,
      shapesOf(PRESETS.find(({ name }) => name === board.preset)),
    ]),
  );
  const { connections } = readBlueprintDraft(
    'studio',
    {
      boards: BOARDS,
      connections: [
        'bugs.bug blocks work.story',
        'work.story blocks bugs.bug',
        'art.bug relates work.story',
      ],
      playbook: null,
    },
    PRESETS,
  );

  it('reads a board: what it waits for and in which state, what feeds it, whom it holds up', () => {
    const work = readingsFor('work', connections, shapes);

    expect(work).toContainEqual({
      kind: 'waits',
      connection: connections[0],
      state: 'in_progress',
    });
    expect(work).toContainEqual({ kind: 'holds', connection: connections[1], state: undefined });
    expect(work).toContainEqual({ kind: 'fed', connection: connections[2] });
    expect(work).toContainEqual({ kind: 'children', type: 'epic', state: 'review' });
  });

  it('finds boards that block each other in a loop', () => {
    expect(blockLoops(connections)).toEqual([['bugs', 'work', 'bugs']]);
  });

  it('puts the board with the most links in the middle and joins neighbours side to side', () => {
    const boxes = layoutBoxes(BOARDS, connections, shapes);

    expect(boxes.map(({ board }) => board.name)).toEqual(['bugs', 'work', 'art']);
    expect(linkPaths(boxes, connections)).toHaveLength(3);
  });
});
