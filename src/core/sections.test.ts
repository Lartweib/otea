import { describe, expect, it } from 'vitest';
import { type Layout, readLayout } from './modules.ts';
import { evidenceModules, placeEvidence } from './placement.ts';
import { type FieldSpec, readPreset } from './preset.ts';

const FIELDS: Record<string, FieldSpec> = {
  title: { module: 'text', required: 'create' },
  description: { module: 'markdown', required: 'complete' },
  area: { module: 'text' },
};

const AT = 'types.bug.layout';

const problemsOf = (raw: unknown) => readLayout(raw, FIELDS, AT).problems;

const sections = [
  { title: 'Brief', entries: ['description', { module: 'images', id: 'screenshots' }] },
  { title: 'Testing notes', width: 'half', entries: ['area'] },
  { title: 'Structure', entries: [{ module: 'relations' }, { module: 'children' }] },
];

describe('layout sections', () => {
  it('leaves a layout without sections as it was', () => {
    expect(readLayout({ body: ['area'] }, FIELDS, AT).layout.sections).toBeUndefined();
  });

  it('reads sections in order, with entries in the slot-entry forms and a width', () => {
    const { layout, problems } = readLayout({ sections }, FIELDS, AT);
    expect(problems).toEqual([]);
    expect(layout.sections?.map(({ title, width }) => [title, width])).toEqual([
      ['Brief', undefined],
      ['Testing notes', 'half'],
      ['Structure', undefined],
    ]);
    expect(layout.sections?.[0]?.entries).toEqual([
      { module: 'markdown', field: 'description' },
      { module: 'images', id: 'screenshots' },
    ]);
    expect(layout.body).toEqual([]);
    expect(layout.evidence).toEqual([]);
  });

  it('keeps the other slots', () => {
    const { layout } = readLayout({ sections, side: ['area'] }, FIELDS, AT);
    expect(layout.side).toEqual([{ module: 'text', field: 'area' }]);
  });

  it.each([
    [
      'a body beside sections',
      { sections, body: ['area'] },
      `${AT}.body: must be empty when sections are declared; place its entries in a section`,
    ],
    [
      'an evidence slot beside sections',
      { sections, evidence: [{ module: 'log' }] },
      `${AT}.evidence: must be empty when sections are declared; place its entries in a section`,
    ],
    [
      'a duplicate field',
      { sections: [{ title: 'A', entries: ['area', 'area'] }] },
      `${AT}.sections[0].entries[1]: field "area" is already in the sections`,
    ],
    [
      'a duplicate field across sections',
      {
        sections: [
          { title: 'A', entries: ['area'] },
          { title: 'B', entries: ['area'] },
        ],
      },
      `${AT}.sections[1].entries[0]: field "area" is already in the sections`,
    ],
    [
      'a duplicate relation module',
      { sections: [{ title: 'A', entries: [{ module: 'relations' }, { module: 'relations' }] }] },
      `${AT}.sections[0].entries[1]: the relations module is already in the sections`,
    ],
    [
      'an unknown section key',
      { sections: [{ title: 'A', entries: [], extra: 1 }] },
      `${AT}.sections[0]: unknown key "extra" (keys: title, width, entries)`,
    ],
    [
      'a bad width',
      { sections: [{ title: 'A', width: 'third', entries: [] }] },
      `${AT}.sections[0].width: must be full or half`,
    ],
    [
      'a missing title',
      { sections: [{ entries: [] }] },
      `${AT}.sections[0].title: must be a non-empty text`,
    ],
    [
      'a header-only module in a section',
      { sections: [{ title: 'A', entries: [{ module: 'score' }] }] },
      `${AT}.sections[0].entries[0]: the score module cannot sit in a section (slots: header, side, row)`,
    ],
    ['sections that is not a list', { sections: 3 }, `${AT}.sections: must be a list`],
  ])('rejects %s', (_, raw, problem) => {
    expect(problemsOf(raw)).toContain(problem);
  });
});

describe('unplaced field notes', () => {
  const yaml = (entries: string) => `
preset: bugs
preset_version: 1
fields:
  title: { module: text, required: create }
  steps: { module: markdown }
workflow:
  initial: open
  states:
    open: { turn: human }
    done: { turn: none, closes: done }
  transitions:
    - { from: open, to: done, by: human }
layout:
  row: [title]
  intake: [title]
  sections:
    - { title: Brief, entries: [${entries}] }
`;
  const unplaced = (entries: string) => {
    const reading = readPreset(yaml(entries));
    if (!reading.ok) throw new Error(reading.problems.join('; '));
    return reading.notes.filter(({ code }) => code === 'field_unplaced');
  };

  it('counts a field placed in a section as placed', () => {
    expect(unplaced('steps')).toEqual([]);
  });

  it('still warns about a field no section places', () => {
    expect(unplaced('')).toHaveLength(1);
  });
});

describe('evidence in sections', () => {
  const layout: Layout = readLayout(
    {
      sections: [
        { title: 'Proof', entries: [{ module: 'images', id: 'shots' }] },
        { title: 'More', entries: [{ module: 'log', id: 'trace' }] },
      ],
    },
    FIELDS,
    AT,
  ).layout;
  const item = { id: 'BUGS-1', type: 'bug' };

  it('lists the evidence modules of every section', () => {
    expect(evidenceModules(layout).map(({ id }) => id)).toEqual(['shots', 'trace']);
  });

  it('attaches a file to the module of a section', () => {
    expect(placeEvidence(layout, item, { filename: 'a.png' })).toEqual({
      module: 'shots',
      role: 'single',
    });
  });
});
