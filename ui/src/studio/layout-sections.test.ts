import { describe, expect, it } from 'vitest';
import { rawOf, readDraft } from './draft.ts';
import {
  addSection,
  ensureSections,
  moveEntry,
  moveSection,
  removeSection,
  renameSection,
  setSectionWidth,
} from './layout-edit.ts';

const PRESET = `preset: bugs
preset_version: 1
fields:
  title: { module: text, required: create }
  description: { module: markdown }
  severity: { module: severity }
  area: { module: text }
workflow:
  initial: open
  states:
    open: { turn: human }
    done: { turn: none, closes: done }
  transitions:
    - { from: open, to: done, by: human-ui }
types:
  bug:
    label: Bug
    layout:
      header: [severity]
      evidence: [{ module: log, id: trace }]
      body: [description, { module: children }]
      side: [area, { module: relations }]
      row: [severity]
      intake: [title, description]
`;

function read(yaml: string) {
  const reading = readDraft(yaml);
  if (!reading.ok) throw new Error(reading.problems.join('; '));
  return reading.preset;
}

const layoutOf = (yaml: string) =>
  rawOf(yaml).types?.bug?.layout as Record<string, unknown> | undefined;

const sectionsOf = (yaml: string) =>
  (layoutOf(yaml)?.sections as { title: string; width?: string; entries: unknown[] }[]) ?? [];

describe('ensureSections', () => {
  const yaml = ensureSections(PRESET, read(PRESET), 'bug');

  it('materializes the body, the evidence and the relations as Brief and Structure', () => {
    expect(sectionsOf(yaml)).toEqual([
      {
        title: 'Brief',
        entries: [{ module: 'log', id: 'trace' }, 'description'],
      },
      { title: 'Structure', entries: [{ module: 'children' }, { module: 'relations' }] },
    ]);
  });

  it('empties the body and evidence and keeps the other slots', () => {
    const layout = layoutOf(yaml);
    expect(layout?.body).toBeUndefined();
    expect(layout?.evidence).toBeUndefined();
    expect(layout?.side).toEqual(['area']);
    expect(layout?.header).toEqual(['severity']);
  });

  it('writes a layout the preset reads without problems', () => {
    const type = read(yaml).types.find(({ name }) => name === 'bug');
    expect(type?.layout.sections).toHaveLength(2);
  });

  it('leaves a layout that has sections as it is', () => {
    expect(ensureSections(yaml, read(yaml), 'bug')).toBe(yaml);
  });
});

describe('editing sections', () => {
  const base = ensureSections(PRESET, read(PRESET), 'bug');
  const preset = read(base);

  it('adds a section, creating them first when there are none', () => {
    const next = addSection(PRESET, read(PRESET), 'bug', 'Notes');
    expect(sectionsOf(next).map(({ title }) => title)).toEqual(['Brief', 'Structure', 'Notes']);
    expect(sectionsOf(next)[2]?.entries).toEqual([]);
  });

  it('renames a section', () => {
    expect(sectionsOf(renameSection(base, preset, 'bug', 0, 'Overview'))[0]?.title).toBe(
      'Overview',
    );
  });

  it('moves a section', () => {
    const next = moveSection(base, preset, 'bug', 1, 0);
    expect(sectionsOf(next).map(({ title }) => title)).toEqual(['Structure', 'Brief']);
  });

  it('sets a half width and drops it for full', () => {
    const half = setSectionWidth(base, preset, 'bug', 0, 'half');
    expect(sectionsOf(half)[0]?.width).toBe('half');
    const full = setSectionWidth(half, read(half), 'bug', 0, 'full');
    expect(sectionsOf(full)[0]).not.toHaveProperty('width');
  });

  it('removes a section; its entries are unplaced', () => {
    const next = removeSection(base, preset, 'bug', 0);
    expect(sectionsOf(next).map(({ title }) => title)).toEqual(['Structure']);
    expect(JSON.stringify(sectionsOf(next))).not.toContain('description');
  });
});

describe('moveEntry', () => {
  const base = ensureSections(PRESET, read(PRESET), 'bug');
  const preset = read(base);
  const move = (
    from: Parameters<typeof moveEntry>[3],
    to: Parameters<typeof moveEntry>[4],
    yaml = base,
  ) => moveEntry(yaml, read(yaml), 'bug', from, to);

  it('moves an entry between sections', () => {
    const done = move({ section: 0, index: 1 }, { section: 1, index: 0 });
    if (!done.ok) throw new Error(done.reason);
    expect(sectionsOf(done.yaml)[0]?.entries).toEqual([{ module: 'log', id: 'trace' }]);
    expect(sectionsOf(done.yaml)[1]?.entries[0]).toBe('description');
  });

  it('reorders inside a section', () => {
    const done = move({ section: 0, index: 0 }, { section: 0, index: 2 });
    if (!done.ok) throw new Error(done.reason);
    expect(sectionsOf(done.yaml)[0]?.entries).toEqual([
      'description',
      { module: 'log', id: 'trace' },
    ]);
  });

  it('moves a field from a section to a slot, and back', () => {
    const out = move({ section: 0, index: 1 }, { slot: 'side', index: 0 });
    if (!out.ok) throw new Error(out.reason);
    expect(layoutOf(out.yaml)?.side).toEqual(['description', 'area']);
    expect(sectionsOf(out.yaml)[0]?.entries).toEqual([{ module: 'log', id: 'trace' }]);
    const back = move({ slot: 'side', index: 0 }, { section: 1, index: 0 }, out.yaml);
    if (!back.ok) throw new Error(back.reason);
    expect(sectionsOf(back.yaml)[1]?.entries[0]).toBe('description');
    expect(layoutOf(back.yaml)?.side).toEqual(['area']);
  });

  it('refuses a module a slot does not take', () => {
    const out = move({ section: 0, index: 0 }, { slot: 'header', index: 0 });
    expect(out).toEqual({
      ok: false,
      reason: 'The log module cannot sit in header (it goes in evidence, body, side, phone).',
    });
  });

  it('refuses a field already in the target slot', () => {
    const out = move({ section: 0, index: 1 }, { slot: 'intake', index: 0 });
    expect(out.ok).toBe(false);
    expect(out.ok ? '' : out.reason).toBe('Field "description" is already in intake.');
  });

  it('refuses to take a field required to create out of the create form', () => {
    const out = move({ slot: 'intake', index: 0 }, { section: 0, index: 0 });
    expect(out.ok ? '' : out.reason).toMatch(/required to create/);
  });

  it('refuses a relation module where it cannot sit', () => {
    const out = move({ section: 1, index: 1 }, { slot: 'row', index: 0 });
    expect(out.ok ? '' : out.reason).toMatch(/relations module cannot sit in row/);
  });

  it('refuses when there is nothing at the origin', () => {
    expect(move({ section: 0, index: 9 }, { section: 1, index: 0 }).ok).toBe(false);
    expect(preset).toBeDefined();
  });
});
