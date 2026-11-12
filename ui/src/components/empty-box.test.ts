import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readPreset } from '../../../src/core/preset.ts';
import type { CollectionView, ItemView } from '../types.ts';
import { draftPreview } from './draft-preview.ts';
import { ItemDetail } from './ItemDetail.tsx';

// A box with nothing to show is not drawn on an item's page. The builder still draws it, so it can
// be filled.

const official = (file: string) =>
  readFileSync(new URL(`../../../presets/bug-triage/${file}`, import.meta.url), 'utf8');

function setup() {
  const reading = readPreset(official('preset.yaml'));
  if (!reading.ok) throw new Error(reading.problems.join('; '));
  const preview = draftPreview(
    reading.preset,
    { yaml: official('samples.yaml'), files: [] },
    { collection: 'bugs', now: '2026-11-04T12:00:00.000Z' },
  );
  const sample = preview.view('BUGS-1');
  if (!sample) throw new Error('bug-triage ships BUGS-1');
  const [bug] = preview.collection.types;
  if (!bug) throw new Error('bug-triage has a type');
  const boxed: CollectionView = {
    ...preview.collection,
    types: [
      {
        ...bug,
        layout: {
          ...bug.layout,
          body: [],
          evidence: [],
          sections: [
            {
              title: 'Notes',
              width: 'full',
              entries: [{ module: 'text', field: 'environment' }],
            },
            {
              title: 'Triage',
              width: 'full',
              entries: [{ module: 'severity', field: 'severity' }],
            },
          ],
        },
      },
    ],
  };
  return { collection: boxed, sample };
}

const draw = (collection: CollectionView, item: ItemView, placeholders = false) =>
  renderToStaticMarkup(
    createElement(ItemDetail, {
      item,
      canWrite: false,
      collection,
      collectionOf: () => collection,
      placeholders,
    }),
  );

describe('a box with nothing to show', () => {
  it('is not drawn on the real page, while the boxes with values are', () => {
    const { collection, sample } = setup();
    const html = draw(collection, { ...sample, fields: { environment: 'Windows 11' } });

    expect(html).toContain('>Notes<');
    expect(html).not.toContain('>Triage<');
  });

  it('is still drawn in the builder, which asks for placeholders', () => {
    const { collection, sample } = setup();
    const html = draw(collection, { ...sample, fields: { environment: 'Windows 11' } }, true);

    expect(html).toContain('>Notes<');
    expect(html).toContain('>Triage<');
  });

  it('leaves out the Brief of an item with no fields, and its "No fields." line', () => {
    const { collection, sample } = setup();
    const [bug] = collection.types;
    if (!bug) throw new Error('a type');
    const { sections: _, ...layout } = bug.layout;
    const plain: CollectionView = { ...collection, types: [{ ...bug, layout }] };
    const empty = { ...sample, fields: {}, evidence: [] };

    expect(draw(plain, empty)).not.toContain('No fields.');
    expect(draw(plain, empty, true)).toContain('No fields.');
  });
});
