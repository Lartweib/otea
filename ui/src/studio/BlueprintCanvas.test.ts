import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PresetView, TypeView } from '../types.ts';
import { BlueprintCanvas, BoardList } from './BlueprintCanvas.tsx';
import { readBlueprintDraft, shapesOf } from './blueprint.ts';
import type { BoardSample } from './preview.ts';

const type = (name: string, states: Array<{ name: string; requires?: string[] }>): TypeView =>
  ({
    name,
    label: name,
    icon: 'checkbox',
    initial: states[0]?.name ?? '',
    states: states.map((state) => ({ turn: 'agent', ...state })),
    fields: [],
    layout: {},
  }) as unknown as TypeView;

const preset = (name: string, version: number, types: TypeView[]): PresetView =>
  ({ name, version, origin: 'official', fields: [], types, view: {}, collections: [] }) as never;

const PRESETS = [
  preset('tasks', 2, [
    type('task', [{ name: 'todo' }, { name: 'in_progress', requires: ['blockers_closed'] }]),
  ]),
  preset('bug-triage', 3, [type('bug', [{ name: 'reported' }]), type('improvement', [])]),
];
const BOARDS = [
  { name: 'bugs', preset: 'bug-triage' },
  { name: 'work', preset: 'tasks' },
];
const DRAFT = { boards: BOARDS, connections: ['bugs.bug blocks work.task'], playbook: null };
const { connections } = readBlueprintDraft('product', DRAFT, PRESETS);
const shapes = new Map(
  BOARDS.map((board) => [board.name, shapesOf(PRESETS.find(({ name }) => name === board.preset))]),
);
const SAMPLE: BoardSample = {
  id: 'BUGS-1',
  title: 'Wall-slide jump drops the buffered input',
  type: 'bug',
  state: 'reported',
  node: 'yours',
};

const props = {
  boards: BOARDS,
  connections,
  shapes,
  presets: PRESETS,
  iconOf: () => 'bug',
  sampleOf: (board: string) => (board === 'bugs' ? SAMPLE : undefined),
  mode: 'types' as const,
  onMode: () => {},
  selected: { kind: 'link' as const, text: 'bugs.bug blocks work.task' },
  onSelect: () => {},
  onAddBoard: () => {},
};

describe('the blueprint canvas', () => {
  it('draws each board as a card: its preset and version, its types and a sample row', () => {
    const html = renderToStaticMarkup(createElement(BlueprintCanvas, props));

    expect(html).toContain('data-board="bugs"');
    expect(html).toContain('bug-triage v3');
    expect(html).toContain('2 types');
    expect(html).toContain('improvement');
    expect(html).toContain('Wall-slide jump drops the buffered input');
    expect(html).toContain('BUGS-1 · reported');
  });

  it('draws each link as its kind, and marks the one selected', () => {
    const html = renderToStaticMarkup(createElement(BlueprintCanvas, props));

    expect(html).toMatch(/data-link="bugs.bug blocks work.task"[^>]*aria-pressed="true"/);
    expect(html).toContain('marker-end="url(#st-bpc-bar)"');
  });

  it('lists the states under each type with types and states, and marks the one that waits', () => {
    const types = renderToStaticMarkup(createElement(BlueprintCanvas, props));
    const states = renderToStaticMarkup(
      createElement(BlueprintCanvas, { ...props, mode: 'states' }),
    );

    expect(types).not.toContain('in_progress');
    expect(states).toContain('in_progress');
    expect(states).toContain('waits for blockers');
  });

  it('offers + board only where the blueprint can be edited', () => {
    const readOnly = renderToStaticMarkup(
      createElement(BlueprintCanvas, { ...props, onAddBoard: undefined }),
    );

    expect(renderToStaticMarkup(createElement(BlueprintCanvas, props))).toContain('st-bpc-add');
    expect(readOnly).not.toContain('st-bpc-add');
  });
});

describe('the blueprint on a phone', () => {
  it('stacks the boards and lists the links as text, with no diagram', () => {
    const html = renderToStaticMarkup(createElement(BoardList, props));

    expect(html).not.toContain('<svg class="st-bpc-svg"');
    expect(html).toContain('bug-triage v3');
    expect(html).toContain('BUGS-1 · reported');
    expect(html).toMatch(/bugs\.bug<\/code>.*blocks.*work\.task/);
  });
});
