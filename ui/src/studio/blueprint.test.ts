import { describe, expect, it } from 'vitest';
import type { PresetView, TypeView } from '../types.ts';
import {
  blockLoops,
  CARD_W,
  COL_GAP,
  cardLinks,
  changeLink,
  layoutCards,
  nextLink,
  readBlueprintDraft,
  readingsFor,
  SAMPLE_H,
  STATE_ROW,
  shapesOf,
  WAIT_LINE,
  withoutBoard,
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

  it("lists each type's states, and marks the one that waits and on what", () => {
    expect(shapes.get('work')?.[0]?.states).toEqual([
      { name: 'todo' },
      { name: 'in_progress', waits: 'blockers' },
    ]);
  });

  it('leaves out the incomplete state and the ones that discard, which no link is about', () => {
    const bug = {
      ...type('bug', [{ name: 'draft' }, { name: 'open' }, { name: 'dropped' }]),
      incomplete: 'draft',
    } as TypeView;
    const dropped = bug.states[2];
    if (dropped) dropped.closes = 'discarded';

    expect(shapesOf(preset('triage', [bug]))[0]?.states).toEqual([{ name: 'open' }]);
  });
});

describe('editing the draft on the canvas', () => {
  const shapes = new Map(
    BOARDS.map((board) => [
      board.name,
      shapesOf(PRESETS.find(({ name }) => name === board.preset)),
    ]),
  );
  const draft = { boards: BOARDS, connections: ['bugs.bug blocks work.story'], playbook: null };

  it('changes one end or the kind of a link in place, and gives its new text', () => {
    const changed = changeLink(draft, 'bugs.bug blocks work.story', {
      from: { board: 'bugs', type: 'bug' },
      kind: 'implements',
      to: { board: 'work', type: 'epic' },
    });

    expect(changed).toEqual({
      draft: { ...draft, connections: ['bugs.bug implements work.epic'] },
      text: 'bugs.bug implements work.epic',
    });
  });

  it('adds a link between the first two boards that is not there yet', () => {
    expect(nextLink(draft, shapes)).toBe('work.story blocks bugs.bug');
    expect(nextLink({ ...draft, boards: BOARDS.slice(0, 1) }, shapes)).toBeUndefined();
  });

  it('removes a board with the links that touch it', () => {
    expect(withoutBoard(draft, 'bugs')).toEqual({
      ...draft,
      boards: BOARDS.filter(({ name }) => name !== 'bugs'),
      connections: [],
    });
  });
});

describe('the canvas of cards', () => {
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
      connections: ['bugs.bug blocks work.story', 'art.bug implements work.epic'],
      playbook: null,
    },
    PRESETS,
  );
  const sampled = () => true;

  it('puts the target of a link right of its source, and stacks the boards of a column', () => {
    const cards = layoutCards(BOARDS, connections, shapes, 'types', sampled);
    const at = (name: string) => cards.find(({ board }) => board.name === name);

    expect(at('bugs')?.x).toBe(at('art')?.x);
    expect(at('work')?.x).toBe((at('bugs')?.x ?? 0) + CARD_W + COL_GAP);
    expect(at('art')?.y).toBeGreaterThanOrEqual((at('bugs')?.y ?? 0) + (at('bugs')?.h ?? 0));
  });

  it('makes room under each type for its states, with more for the state that waits', () => {
    const types = layoutCards(BOARDS, connections, shapes, 'types', sampled);
    const states = layoutCards(BOARDS, connections, shapes, 'states', sampled);
    const work = (cards: typeof types) => cards.find(({ board }) => board.name === 'work');

    expect((work(states)?.h ?? 0) - (work(types)?.h ?? 0)).toBe(3 * STATE_ROW + 2 * WAIT_LINE);
    expect(work(states)?.rows[1]?.y).toBe(
      (work(types)?.rows[1]?.y ?? 0) + 2 * STATE_ROW + WAIT_LINE,
    );
  });

  it('leaves no room for a sample row on a board whose preset has none', () => {
    const none = layoutCards(BOARDS, connections, shapes, 'types', () => false);
    const some = layoutCards(BOARDS, connections, shapes, 'types', sampled);

    expect((some[0]?.h ?? 0) - (none[0]?.h ?? 0)).toBe(SAMPLE_H);
  });

  it('draws a link from the source type’s right port to the target type’s left port', () => {
    const cards = layoutCards(BOARDS, connections, shapes, 'types', sampled);
    const [blocks] = cardLinks(cards, connections);
    const bugs = cards.find(({ board }) => board.name === 'bugs');
    const work = cards.find(({ board }) => board.name === 'work');
    if (!blocks || !bugs || !work) throw new Error('no link');
    const y1 = bugs.y + (bugs.rows[0]?.y ?? 0);
    const y2 = work.y + (work.rows[0]?.y ?? 0);

    expect(blocks.d.startsWith(`M${bugs.x + CARD_W} ${y1} `)).toBe(true);
    expect(blocks.d.endsWith(` ${work.x} ${y2}`)).toBe(true);
    expect(blocks.label).toEqual({ x: (bugs.x + CARD_W + work.x) / 2, y: (y1 + y2) / 2 });
  });
});
