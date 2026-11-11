import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readPreset } from '../../../src/core/preset.ts';
import { readSamples } from '../../../src/core/samples.ts';
import { draftCollectionView } from '../../../src/core/views.ts';
import type { CollectionView, Item, ItemView } from '../types.ts';
import { boardSample, draftPreview } from './preview.ts';

const NOW = '2026-11-04T12:00:00.000Z';

const file = (name: string) =>
  readFileSync(new URL(`../../../presets/bug-triage/${name}`, import.meta.url), 'utf8');

function bugTriage() {
  const reading = readPreset(file('preset.yaml'));
  if (!reading.ok) throw new Error(reading.problems.join('; '));
  return reading.preset;
}

describe('boardSample', () => {
  it('reads the first sample a board can draw, with its state in words and its node', () => {
    const preset = bugTriage();
    const { samples } = readSamples(file('samples.yaml'), preset, []);
    const { types } = draftCollectionView(preset, { name: 'bugs' });

    expect(boardSample(samples, types)).toEqual({
      id: 'BUGS-1',
      title: 'Wall-slide jump drops the buffered input',
      type: 'bug',
      state: 'reported',
      node: 'yours',
    });
    expect(boardSample(samples, [])).toBeUndefined();
  });
});

describe('draftPreview', () => {
  const samples = {
    yaml: file('samples.yaml'),
    files: ['wall-slide-before.png', 'wall-slide-after.png'],
  };

  it('builds the collection, the rows and each detail in the shapes the server sends', () => {
    const preview = draftPreview(bugTriage(), samples, { collection: 'bugs', now: NOW });

    const collection: CollectionView = preview.collection;
    const rows: Item[] = preview.items;
    const detail: ItemView | undefined = preview.view('BUGS-1');

    expect(collection).toMatchObject({ name: 'bugs', prefix: 'BUGS', preset: 'bug-triage' });
    expect(rows.map(({ id }) => id)).toEqual(['BUGS-1', 'BUGS-2', 'BUGS-3', 'BUGS-4']);
    expect(detail).toMatchObject({ id: 'BUGS-1', turn: 'human', state: 'reported' });
    expect(preview.notes).toEqual([]);
  });

  it('reads the samples against the draft: a state the draft removed is noted', () => {
    const draft = bugTriage();
    const without = {
      ...draft,
      types: draft.types.map((type) => ({
        ...type,
        workflow: {
          ...type.workflow,
          states: type.workflow.states.filter(({ name }) => name !== 'fixing'),
        },
      })),
    };

    const preview = draftPreview(without, samples, { collection: 'bugs', now: NOW });

    expect(preview.notes).toEqual([
      expect.objectContaining({
        code: 'sample_unknown_state',
        path: expect.objectContaining({ state: 'fixing' }),
      }),
    ]);
    expect(preview.view('BUGS-2')?.state).toBe('reported');
  });

  it('draws no detail for an id no sample has', () => {
    const preview = draftPreview(bugTriage(), samples, { collection: 'bugs', now: NOW });
    expect(preview.view('BUGS-9')).toBeUndefined();
  });
});
