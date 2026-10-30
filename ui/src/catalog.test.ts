import { describe, expect, it } from 'vitest';
import { catalogEntries, usageSummary } from './catalog.ts';
import type { PresetView } from './types.ts';

const tasks: PresetView = {
  name: 'tasks',
  version: 1,
  origin: 'official',
  fields: [
    { name: 'title', module: 'text', required: 'create' },
    { name: 'description', module: 'markdown', required: 'complete' },
    { name: 'priority', module: 'enum', values: ['low', 'high'], default: 'low' },
  ],
  types: [],
  view: { kind: 'list', groupBy: 'turn' },
  collections: ['tasks', 'bugs'],
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
  view: { kind: 'list', groupBy: 'turn' },
  collections: [],
};

const registered = [
  { name: 'text', origin: 'official' },
  { name: 'markdown', origin: 'official' },
  { name: 'enum', origin: 'official' },
  { name: 'diagram', origin: 'local' },
] as const;

describe('module catalog', () => {
  it('lists registered modules in order, then unknown ones referenced by presets, by name', () => {
    expect(
      catalogEntries(registered, [tasks, research]).map(({ name, origin }) => [name, origin]),
    ).toEqual([
      ['text', 'official'],
      ['markdown', 'official'],
      ['enum', 'official'],
      ['diagram', 'local'],
      ['audio', 'unknown'],
      ['rating', 'unknown'],
    ]);
  });

  it('records which preset fields use each module and their collections', () => {
    const [text] = catalogEntries(registered, [tasks, research]);

    expect(text?.uses).toEqual([
      {
        preset: 'tasks',
        version: 1,
        origin: 'official',
        field: { name: 'title', module: 'text', required: 'create' },
        collections: ['tasks', 'bugs'],
      },
      {
        preset: 'research',
        version: 2,
        origin: 'project',
        field: { name: 'title', module: 'text', required: 'create' },
        collections: [],
      },
    ]);
  });

  it('keeps a registered module that no preset uses, with no uses', () => {
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
    [[], 'not used by any loaded preset'],
    [[tasks], '1 field in tasks'],
    [[tasks, research], '2 fields in 2 presets'],
  ])('summarises the usage of text across %# presets', (presets, summary) => {
    const [text] = catalogEntries(registered, presets);

    expect(usageSummary(text?.uses ?? [])).toBe(summary);
  });
});
