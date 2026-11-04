import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PresetView, TypeView } from '../types.ts';
import { BlueprintInspector } from './BlueprintInspector.tsx';
import { shapesOf } from './blueprint.ts';
import type { BoardSample } from './preview.ts';

const type = (name: string): TypeView =>
  ({ name, label: name, initial: 'open', states: [{ name: 'open', turn: 'agent' }] }) as never;

const preset = (name: string, version: number, types: TypeView[]): PresetView =>
  ({ name, version, origin: 'official', fields: [], types, view: {}, collections: [] }) as never;

const PRESETS = [preset('tasks', 2, [type('task')]), preset('bug-triage', 3, [type('bug')])];
const BOARDS = [
  { name: 'bugs', preset: 'bug-triage' },
  { name: 'work', preset: 'tasks' },
];
const DRAFT = { boards: BOARDS, connections: ['bugs.bug blocks work.task'], playbook: null };
const shapes = new Map(
  BOARDS.map((board) => [board.name, shapesOf(PRESETS.find(({ name }) => name === board.preset))]),
);
const sample = (id: string, node: BoardSample['node']): BoardSample => ({
  id,
  title: id,
  type: '',
  state: '',
  node,
});

const props = {
  draft: DRAFT,
  set: () => {},
  shapes,
  presets: PRESETS,
  sampleOf: (board: string) => sample(board === 'bugs' ? 'BUGS-1' : 'WORK-2', 'queued'),
  selection: { kind: 'link' as const, text: 'bugs.bug blocks work.task' },
  onSelect: () => {},
  itemsOf: (board: string) => (board === 'work' ? 1 : 0),
};

const render = (extra: Partial<typeof props> = {}) =>
  renderToStaticMarkup(createElement(BlueprintInspector, { ...props, ...extra }));

describe('the link inspector', () => {
  it('asks from, kind and to, with parent struck through and why', () => {
    const html = render();

    expect(html).toContain('1 of 1');
    expect(html).toMatch(/<h3>from<\/h3>/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>blocks</);
    expect(html).toMatch(/class="st-tog struck"[^>]*disabled=""[^>]*>parent</);
    expect(html).toContain('a parent and its children live in one board');
  });

  it('says what the link means in one sentence, with the command agents run', () => {
    const html = render();

    expect(html).toContain('A bug in bugs may block a task in work.');
    expect(html).toContain('otea link BUGS-1 blocks WORK-2');
  });

  it('lists the links of the blueprint below, with + link where it can be edited', () => {
    expect(render()).toContain('links in this blueprint');
    expect(render()).toContain('st-insp-add');
    expect(render({ set: undefined } as never)).not.toContain('st-insp-add');
  });
});

describe('the board inspector', () => {
  it('names its preset and version and its items, and keeps a board with items', () => {
    const html = render({ selection: { kind: 'board', name: 'work' } } as never);

    expect(html).toContain('tasks v2');
    expect(html).toContain('1 item');
    expect(html).toMatch(/disabled=""[^>]*>remove board/);
  });
});

describe('nothing selected', () => {
  it('shows the list of links', () => {
    const html = render({ selection: undefined } as never);

    expect(html).toContain('links in this blueprint');
    expect(html).not.toMatch(/<h3>from<\/h3>/);
  });
});
