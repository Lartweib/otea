import { describe, expect, it } from 'vitest';
import { catalogEntries, usageSummary } from './catalog.ts';
import type { PresetView } from './types.ts';

const tasks: PresetView = {
  name: 'tasks',
  version: 1,
  origin: 'official',
  fields: [
    { name: 'title', module: 'text', required: 'create', label: 'Título' },
    { name: 'fdesc', module: 'markdown', required: 'complete', label: 'Descripción' },
    { name: 'fprio', module: 'enum', values: ['low', 'high'], default: 'low' },
  ],
  types: [],
  view: { kind: 'list', groupBy: 'turn', columns: ['id', 'title', 'state', 'who', 'age'] },
  collections: ['Tareas'],
};

const research: PresetView = {
  name: 'research',
  version: 2,
  origin: 'project',
  fields: [
    { name: 'title', module: 'text', required: 'create' },
    { name: 'score', module: 'rating' },
    { name: 'clip', module: 'audio' },
  ],
  types: [],
  view: { kind: 'list', groupBy: 'turn', columns: ['id', 'title', 'state', 'who', 'age'] },
  collections: ['Notas'],
};

// An official preset no board was read from: none of its fields is any board's.
const unused: PresetView = {
  name: 'review',
  version: 1,
  origin: 'official',
  fields: [{ name: 'verdict', module: 'stars' }],
  types: [],
  view: { kind: 'list', groupBy: 'turn', columns: ['id', 'title', 'state', 'who', 'age'] },
  collections: [],
};

const registered = [
  { name: 'text', origin: 'official' },
  { name: 'markdown', origin: 'official' },
  { name: 'enum', origin: 'official' },
  { name: 'diagram', origin: 'local' },
] as const;

describe('module catalog', () => {
  it('lists registered modules in order, then unknown ones a board names, by name', () => {
    expect(
      catalogEntries(registered, [tasks, research, unused]).map(({ name, origin }) => [
        name,
        origin,
      ]),
    ).toEqual([
      ['text', 'official'],
      ['markdown', 'official'],
      ['enum', 'official'],
      ['diagram', 'local'],
      ['audio', 'unknown'],
      ['rating', 'unknown'],
    ]);
  });

  it('records which board fields use each module, never a preset no board was read from', () => {
    const [text] = catalogEntries(registered, [tasks, research, unused]);

    expect(text?.uses).toEqual([
      {
        board: 'Tareas',
        field: { name: 'title', module: 'text', required: 'create', label: 'Título' },
      },
      { board: 'Notas', field: { name: 'title', module: 'text', required: 'create' } },
    ]);
  });

  it('keeps a registered module that no board uses, with no uses', () => {
    const diagram = catalogEntries(registered, [tasks]).find(({ name }) => name === 'diagram');

    expect(diagram).toEqual({ name: 'diagram', origin: 'local', uses: [] });
  });

  it('lists only registered modules while the presets are unknown', () => {
    expect(catalogEntries(registered, []).map(({ name }) => name)).toEqual([
      'text',
      'markdown',
      'enum',
      'diagram',
    ]);
  });

  it.each([
    [[], 'not used by any board'],
    [[tasks], '1 field on Tareas'],
    [[tasks, research], '2 fields on 2 boards'],
  ])('summarises the usage of text across %# boards', (presets, summary) => {
    const [text] = catalogEntries(registered, presets);

    expect(usageSummary(text?.uses ?? [])).toBe(summary);
  });
});
