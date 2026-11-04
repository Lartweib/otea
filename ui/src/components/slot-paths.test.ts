import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readPreset } from '../../../src/core/preset.ts';
import { intakeSlots, slotData } from '../item-types.ts';
import { draftPreview } from '../studio/preview.ts';
import { FieldControl } from './FieldControl.tsx';
import { ItemDetail } from './ItemDetail.tsx';

// The real detail and create form, drawn from an official preset and its samples, mark every part
// the layout places with its slot, its index there and its field.

const official = (name: string, file: string) =>
  readFileSync(new URL(`../../../presets/${name}/${file}`, import.meta.url), 'utf8');

function previewOf(name: string, collection: string) {
  const reading = readPreset(official(name, 'preset.yaml'));
  if (!reading.ok) throw new Error(reading.problems.join('; '));
  const samples = { yaml: official(name, 'samples.yaml'), files: [] };
  return draftPreview(reading.preset, samples, { collection, now: '2026-11-04T12:00:00.000Z' });
}

describe('slot paths in the DOM', () => {
  it('marks the fields of the detail with their slot, index and field', () => {
    const preview = previewOf('bug-triage', 'bugs');
    const item = preview.view('BUGS-1');
    if (!item) throw new Error('bug-triage ships BUGS-1');

    const html = renderToStaticMarkup(
      createElement(ItemDetail, {
        item,
        canWrite: false,
        collection: preview.collection,
        collectionOf: () => preview.collection,
      }),
    );

    expect(html).toContain('data-type="bug" data-slot="body" data-index="1" data-field="steps"');
    expect(html).toContain('data-slot="body" data-index="0" data-field="description"');
  });

  it('marks the header strip and the modules a layout places', () => {
    const preview = previewOf('change', 'changes');
    const task = preview.view('CHANGES-2');
    const change = preview.view('CHANGES-1');
    if (!task || !change) throw new Error('change ships CHANGES-1 and CHANGES-2');
    const render = (item: typeof task) =>
      renderToStaticMarkup(
        createElement(ItemDetail, {
          item,
          canWrite: false,
          collection: preview.collection,
          collectionOf: () => preview.collection,
        }),
      );

    expect(render(task)).toContain(
      'data-type="repo_task" data-slot="header" data-index="1" data-field="branch"',
    );
    expect(render(change)).toContain('data-type="change" data-slot="body" data-index="2"');
  });

  it('marks each field of the create form with its place in the intake slot', () => {
    const preview = previewOf('bug-triage', 'bugs');
    const [bug] = preview.collection.types;
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
