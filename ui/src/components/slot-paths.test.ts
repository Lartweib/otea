import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readPreset } from '../../../src/core/preset.ts';
import { draftCollectionView } from '../../../src/core/views.ts';
import { intakeSlots, slotData } from '../item-types.ts';
import type { CollectionView } from '../types.ts';
import { FieldControl } from './FieldControl.tsx';

// The real create form, drawn from an official preset, marks every field the intake slot places
// with its slot, its index there and its field.

const official = (name: string, file: string) =>
  readFileSync(new URL(`../../../presets/${name}/${file}`, import.meta.url), 'utf8');

function collectionOf(name: string, collection: string): CollectionView {
  const reading = readPreset(official(name, 'preset.yaml'));
  if (!reading.ok) throw new Error(reading.problems.join('; '));
  return draftCollectionView(reading.preset, { name: collection });
}

describe('slot paths in the DOM', () => {
  it('marks each field of the create form with its place in the intake slot', () => {
    const [bug] = collectionOf('bug-triage', 'bugs').types;
    if (!bug) throw new Error('bug-triage has a type');

    const html = intakeSlots(bug)
      .map(({ field, at }) =>
        renderToStaticMarkup(
          createElement(FieldControl, {
            id: field.name,
            field,
            value: '',
            disabled: false,
            onChange: () => {},
            slot: slotData(at),
          }),
        ),
      )
      .join('');

    expect(html).toContain('data-type="bug" data-slot="intake" data-index="0" data-field="title"');
  });
});
