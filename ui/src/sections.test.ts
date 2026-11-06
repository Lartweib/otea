import { describe, expect, it } from 'vitest';
import { leftovers } from './evidence.ts';
import { rolesFor } from './intake-files.ts';
import { detailBlocks, placesChildren, slotData } from './item-types.ts';
import type { Evidence, Layout, TypeView } from './types.ts';

const EMPTY: Layout = {
  header: [],
  evidence: [],
  body: [],
  side: [],
  row: [],
  phone: [],
  intake: [],
};

const type: TypeView = {
  name: 'bug',
  label: 'Bug',
  initial: 'open',
  states: [],
  fields: [
    { name: 'title', module: 'text', required: 'create' },
    { name: 'steps', module: 'markdown' },
    { name: 'expected', module: 'text' },
  ],
  layout: {
    ...EMPTY,
    sections: [
      {
        title: 'Brief',
        entries: [
          { module: 'markdown', field: 'steps' },
          { module: 'images', id: 'shots', variant: 'compare' },
        ],
      },
      { title: 'Testing notes', width: 'half', entries: [{ module: 'text', field: 'expected' }] },
      { title: 'Structure', entries: [{ module: 'children' }] },
    ],
  },
};

describe('detail sections', () => {
  const blocks = detailBlocks(type, { steps: 'Open it', expected: 'Works' });

  it('draws the sections in order with their title and width', () => {
    expect(blocks.sections?.map(({ title, width }) => [title, width])).toEqual([
      ['Brief', 'full'],
      ['Testing notes', 'half'],
      ['Structure', 'full'],
    ]);
  });

  it('keeps the kind of each block and stamps its place with the section', () => {
    const [brief, notes, structure] = blocks.sections ?? [];
    expect(brief?.blocks.map(({ kind }) => kind)).toEqual(['fields', 'module']);
    expect(structure?.blocks.map(({ kind }) => kind)).toEqual(['relation']);
    const first = notes?.blocks[0];
    const at = first && 'values' in first ? first.values[0]?.at : undefined;
    expect(slotData(at)).toEqual({
      'data-type': 'bug',
      'data-slot': 'body',
      'data-index': '0',
      'data-field': 'expected',
      'data-section': '1',
    });
  });

  it('leaves the primary column to the plain evidence list', () => {
    expect(blocks.primary).toEqual([{ kind: 'evidence' }]);
  });

  it('leaves a layout without sections unchanged', () => {
    expect(detailBlocks({ ...type, layout: EMPTY }, {}).sections).toBeUndefined();
  });

  it('knows a section places children', () => {
    expect(placesChildren(type)).toBe(true);
  });

  it('counts section evidence modules as drawn and as roles to attach', () => {
    const file = (module: string | null) => ({ id: 1, module }) as unknown as Evidence;
    expect(leftovers(type, [file('shots'), file(null)])).toHaveLength(1);
    expect(rolesFor(type)).toEqual(['before', 'after']);
  });
});
