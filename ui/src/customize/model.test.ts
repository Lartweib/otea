import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readPreset } from '../../../src/core/preset.ts';
import {
  addBox,
  addField,
  changesOf,
  commit,
  docOf,
  dropBeside,
  hide,
  keyOf,
  move,
  moveBox,
  redo,
  refusal,
  removeBox,
  renameBox,
  setBeside,
  shown,
  start,
  undo,
  unplaced,
  yamlOf,
} from './model.ts';

const YAML = `preset: t
preset_version: 1
workflow:
  initial: open
  states:
    open: { turn: agent }
    done: { turn: none, closes: done }
  transitions:
    - { from: open, to: done, by: human }
fields:
  title: { module: text, required: create }
  description: { module: markdown }
  environment: { module: text }
  severity: { module: severity }
types:
  bug:
    label: Bug
    layout:
      body: [description, environment]
      side: [severity]
      row: [severity]
      intake: [title, description]
`;
const read = () => {
  const reading = readPreset(YAML);
  if (!reading.ok) throw new Error(reading.problems.join());
  return reading.preset;
};

it('reads the layout into zones', () => {
  const doc = docOf(read(), 'bug');
  expect(doc.sections[0]?.entries).toEqual(['description', 'environment']);
  expect(doc.things.description?.kind).toBe('long');
});

it('refuses long text beside the title', () => {
  expect(refusal('long', 'header')).toMatch(/box/);
  expect(refusal('short', 'header')).toBeUndefined();
  expect(refusal('long', 'row')).toBeDefined();
});

it('moves within the detail and writes the plain words', () => {
  const base = docOf(read(), 'bug');
  const { doc } = move(base, 'environment', { zone: 'side', index: 0 });
  expect(doc.sections[0]?.entries).toEqual(['description']);
  expect(changesOf(base, doc)[0]?.text).toBe('Environment moved from Brief to Details');
  expect(move(base, 'description', { zone: 'side', index: 0 }).refused).toMatch(/box/);
});

it('hides on the panel and lists it unplaced', () => {
  const base = docOf(read(), 'bug');
  const { doc } = move(base, 'environment', { zone: 'panel', index: 0 });
  expect(unplaced(doc).map((t) => t.id)).toEqual(['environment']);
});

it('undoes and redoes', () => {
  const base = docOf(read(), 'bug');
  let h = start(base);
  h = commit(h, move(base, 'environment', { zone: 'side', index: 0 }).doc);
  expect(undo(h).doc).toEqual(base);
  expect(redo(undo(h)).doc).toEqual(h.doc);
});

it('writes moves and new fields back to the file', () => {
  const preset = read();
  const base = docOf(preset, 'bug');
  const moved = move(base, 'environment', { zone: 'side', index: 0 }).doc;
  const { doc, id } = addField(moved, 'Found in build', 'short');
  expect(id).toBe('found_in_build');
  const out = yamlOf(YAML, preset, 'bug', base, doc);
  expect(out).toContain('found_in_build');
  const again = readPreset(out);
  if (!again.ok) throw new Error(again.problems.join());
  expect(docOf(again.preset, 'bug').zones.side).toEqual(['environment', 'severity']);
  expect(keyOf('Versión útil')).toBe('version_util');
});

describe('a preset that speaks another language', () => {
  const SPOKEN = `${YAML}labels:
  es:
    types: { bug: Error }
    states: { open: abierto, done: hecho }
    fields: { title: título, description: descripción, environment: entorno, severity: gravedad }
`;
  const spoken = () => {
    const reading = readPreset(SPOKEN);
    if (!reading.ok) throw new Error(reading.problems.join());
    return reading.preset;
  };

  it('labels a new field in every language with the typed name, and keeps the file valid', () => {
    const preset = spoken();
    const base = docOf(preset, 'bug');
    const { doc } = addField(base, 'Due date', 'short');
    const out = yamlOf(SPOKEN, preset, 'bug', base, doc);
    expect(out).toContain('due_date: Due date');
    expect(readPreset(out).ok).toBe(true);
  });

  it('renames only the visible name', () => {
    const preset = spoken();
    const base = docOf(preset, 'bug');
    const thing = base.things.environment;
    if (!thing) throw new Error('no environment');
    const doc = { ...base, things: { ...base.things, environment: { ...thing, name: 'Where' } } };
    const out = yamlOf(SPOKEN, preset, 'bug', base, doc);
    expect(out).toContain('entorno');
    expect(out).not.toContain('environment: Where');
  });
});

const BOXED = YAML.replace(
  /layout:\n[\s\S]*$/,
  `layout:
      sections:
        - { title: Brief, entries: [description, environment] }
        - { title: Structure, width: half, entries: [{ module: relations }] }
        - { title: Notes, width: half, entries: [] }
      side: [severity]
      row: [severity]
      intake: [title, description]
`,
);
const readBoxed = () => {
  const reading = readPreset(BOXED);
  if (!reading.ok) throw new Error(reading.problems.join());
  return reading.preset;
};
const LINKED = YAML.replace('side: [severity]', 'side: [severity, { module: relations }]');
const readLinked = () => {
  const reading = readPreset(LINKED);
  if (!reading.ok) throw new Error(reading.problems.join());
  return reading.preset;
};
const titles = (doc: ReturnType<typeof docOf>) => doc.sections.map((s) => s.title);
const widths = (doc: ReturnType<typeof docOf>) => doc.sections.map((s) => s.width);

describe('boxes', () => {
  it('derives Brief and Structure from a preset without sections, unboxed', () => {
    const doc = docOf(readLinked(), 'bug');
    expect(titles(doc)).toEqual(['Brief', 'Structure']);
    expect(doc.sections[0]?.entries).toEqual(['description', 'environment']);
    expect(doc.sections[1]?.entries).toEqual(['relations']);
    expect(doc.zones.side).toEqual(['severity']);
    expect(doc.boxed).toBe(false);
  });

  it('reads the sections a preset has, boxed, with their widths', () => {
    const doc = docOf(readBoxed(), 'bug');
    expect(titles(doc)).toEqual(['Brief', 'Structure', 'Notes']);
    expect(widths(doc)).toEqual(['full', 'half', 'half']);
    expect(doc.boxed).toBe(true);
  });

  it('moves a field between boxes and refuses what a place cannot hold', () => {
    const base = docOf(readBoxed(), 'bug');
    const { doc, refused } = move(base, 'environment', { zone: 'section', section: 2, index: 0 });
    expect(refused).toBeUndefined();
    expect(doc.sections[0]?.entries).toEqual(['description']);
    expect(doc.sections[2]?.entries).toEqual(['environment']);
    expect(changesOf(base, doc)[0]?.text).toBe('Environment moved from Brief to Notes');
    expect(move(base, 'description', { zone: 'header', index: 0 }).refused).toMatch(/box/);
    expect(move(base, 'relations', { zone: 'header', index: 0 }).refused).toBeDefined();
  });

  it('adds, renames, reorders and removes boxes and says it in words', () => {
    const base = docOf(readBoxed(), 'bug');
    const added = addBox(base, 'Testing notes');
    expect(titles(added.doc).at(-1)).toBe('Testing notes');
    const renamed = renameBox(added.doc, 0, 'The bug');
    const sorted = moveBox(renamed, 2, 0);
    expect(titles(sorted)).toEqual(['Notes', 'The bug', 'Structure', 'Testing notes']);
    const removed = removeBox(sorted, 1);
    expect(unplaced(removed).map((t) => t.id)).toEqual(['environment']);
    const said = changesOf(base, sorted).map((c) => c.text);
    expect(said).toContain('New box Testing notes');
    expect(said).toContain('Box Brief is now called The bug');
    expect(said).toContain('Boxes in a new order');
  });

  it('puts a box beside the previous one and frees what it leaves alone', () => {
    const base = docOf(readBoxed(), 'bug');
    const full = setBeside(base, 1, false).doc;
    expect(widths(full)).toEqual(['full', 'full', 'full']);
    const beside = setBeside(full, 1, true);
    expect(widths(beside.doc)).toEqual(['half', 'half', 'full']);
    expect(changesOf(full, beside.doc).map((c) => c.text)).toContain(
      'Brief and Structure now sit side by side',
    );
    expect(setBeside(full, 0, true).refused).toBeDefined();
    expect(setBeside(beside.doc, 2, true).refused).toBeDefined();
    expect(widths(setBeside(beside.doc, 1, false).doc)).toEqual(['full', 'full', 'full']);
  });

  it('drops a box beside another from anywhere', () => {
    const base = setBeside(docOf(readBoxed(), 'bug'), 1, false).doc;
    const { doc } = dropBeside(base, 2, 0);
    expect(titles(doc)).toEqual(['Brief', 'Notes', 'Structure']);
    expect(widths(doc)).toEqual(['half', 'half', 'full']);
  });

  it('undoes and redoes box changes', () => {
    const base = docOf(readBoxed(), 'bug');
    let h = start(base);
    h = commit(h, addBox(h.doc, 'Testing notes').doc);
    h = commit(h, renameBox(h.doc, 3, 'QA'));
    expect(undo(undo(h)).doc).toEqual(base);
    expect(undo(h).doc.sections[3]?.title).toBe('Testing notes');
    expect(redo(undo(h)).doc.sections[3]?.title).toBe('QA');
  });

  it('keeps a preset without sections as it was when only fields move in Brief', () => {
    const preset = readLinked();
    const base = docOf(preset, 'bug');
    const { doc } = move(base, 'environment', { zone: 'section', section: 0, index: 0 });
    expect(doc.boxed).toBe(false);
    const out = yamlOf(LINKED, preset, 'bug', base, doc);
    expect(out).not.toContain('sections');
    expect(out).toMatch(/body: \[ ?environment, description ?\]/);
    expect(out).toContain('relations');
  });

  it('migrates to sections when a box changes, and the file reads back', () => {
    const preset = readLinked();
    const base = docOf(preset, 'bug');
    let doc = addBox(base, 'Testing notes').doc;
    doc = move(doc, 'environment', { zone: 'section', section: 2, index: 0 }).doc;
    doc = setBeside(doc, 2, true).doc;
    expect(doc.boxed).toBe(true);
    const out = yamlOf(LINKED, preset, 'bug', base, doc);
    expect(out).toContain('sections');
    expect(out).not.toMatch(/\n\s+body:/);
    const again = readPreset(out);
    if (!again.ok) throw new Error(again.problems.join());
    const back = docOf(again.preset, 'bug');
    expect(titles(back)).toEqual(['Brief', 'Structure', 'Testing notes']);
    expect(back.sections[2]?.entries).toEqual(['environment']);
    expect(widths(back)).toEqual(['full', 'half', 'half']);
    expect(back.zones.side).toEqual(['severity']);
  });

  it('migrates a preset that declares no layout at all', () => {
    const bare = YAML.replace(/ {4}layout:\n[\s\S]*$/, '');
    const reading = readPreset(bare);
    if (!reading.ok) throw new Error(reading.problems.join());
    const base = docOf(reading.preset, 'bug');
    expect(base.boxed).toBe(false);
    const { doc } = addBox(base, 'Testing notes');
    const out = yamlOf(bare, reading.preset, 'bug', base, doc);
    const again = readPreset(out);
    if (!again.ok) throw new Error(again.problems.join());
    const back = docOf(again.preset, 'bug');
    expect(titles(back)).toContain('Testing notes');
    expect(back.sections[0]?.entries).toEqual(base.sections[0]?.entries);
  });

  it('hides a field from one view only, and says what it is still in', () => {
    const base = docOf(readBoxed(), 'bug');
    const detail = hide(base, 'description', 'detail');
    expect(detail.doc.sections[0]?.entries).toEqual(['environment']);
    expect(detail.doc.zones.intake).toContain('description');
    expect(shown(detail.doc, 'description', 'detail')).toBe(false);
    expect(shown(detail.doc, 'description', 'intake')).toBe(true);
    const row = hide(base, 'severity', 'row');
    expect(row.doc.zones.row).toEqual([]);
    expect(row.doc.zones.side).toEqual(['severity']);
    expect(hide(base, 'title', 'intake').refused).toMatch(/needed to create/);
  });

  it('writes the bug-triage preset back with a new field and a new box', () => {
    const source = readFileSync('presets/bug-triage/preset.yaml', 'utf8');
    const reading = readPreset(source);
    if (!reading.ok) throw new Error(reading.problems.join());
    const base = docOf(reading.preset, 'bug');
    const field = addField(base, 'Due date', 'short');
    const { doc } = addBox(field.doc, 'Testing notes');
    const out = yamlOf(source, reading.preset, 'bug', base, doc);
    const again = readPreset(out);
    if (!again.ok) throw new Error(again.problems.join());
    const back = docOf(again.preset, 'bug');
    expect(back.things.due_date?.name).toBe('Due date');
    expect(back.sections[0]?.entries).toContain('due_date');
  });

  it('migrates when a relation is placed elsewhere', () => {
    const base = docOf(readLinked(), 'bug');
    const { doc } = move(base, 'relations', { zone: 'section', section: 0, index: 0 });
    expect(doc.boxed).toBe(true);
  });
});

describe('hiding a field from one view', () => {
  it('lists it as not in that view while the others still show it, and brings it back', () => {
    const base = docOf(read(), 'bug');
    // severity sits in the detail, the row; description in the detail and the form
    const detail = move(base, 'severity', { zone: 'panel', index: 0 }).doc;
    expect(shown(detail, 'severity', 'detail')).toBe(false);
    expect(shown(detail, 'severity', 'row')).toBe(true);
    const form = hide(base, 'description', 'intake').doc;
    expect(shown(form, 'description', 'intake')).toBe(false);
    expect(shown(form, 'description', 'detail')).toBe(true);
    const back = move(detail, 'severity', { zone: 'side', index: 0 }).doc;
    expect(shown(back, 'severity', 'detail')).toBe(true);
    const row = hide(base, 'severity', 'row').doc;
    expect(shown(row, 'severity', 'row')).toBe(false);
    expect(shown(row, 'severity', 'detail')).toBe(true);
  });
});

describe('blocks to add', () => {
  const ids = (doc: ReturnType<typeof docOf>) =>
    Object.values(doc.things)
      .filter((thing) => thing.entry !== undefined)
      .map((thing) => thing.id);

  it('offers every block the type does not use yet, unplaced and named', () => {
    const doc = docOf(read(), 'bug');
    expect(ids(doc)).toEqual([
      'images',
      'recording',
      'diff',
      'log',
      'diagram',
      'relations',
      'children',
    ]);
    expect(doc.things.recording?.name).toBe('Video');
    expect(doc.things.diff?.name).toBe('Code changes');
    expect(doc.things.relations?.name).toBe('Related items');
    expect(doc.things.children?.name).toBe('Sub-items');
    expect(unplaced(doc)).toEqual([]);
  });

  it('does not offer a second one of a block the layout already has', () => {
    const doc = docOf(readBoxed(), 'bug');
    expect(ids(doc).filter((id) => id.startsWith('relations'))).toEqual(['relations']);
  });

  it('writes a placed block as a real module with its own id, valid in the file', () => {
    const preset = read();
    const base = docOf(preset, 'bug');
    const { doc } = move(base, 'images', { zone: 'section', section: 0, index: 0 });
    const out = yamlOf(YAML, preset, 'bug', base, doc);
    expect(out).toContain('module: images');
    const again = readPreset(out);
    if (!again.ok) throw new Error(again.problems.join());
    expect(docOf(again.preset, 'bug').sections[0]?.entries).toContain('images');
    const diff = move(base, 'diff', { zone: 'section', section: 0, index: 2 }).doc;
    expect(readPreset(yamlOf(YAML, preset, 'bug', base, diff)).ok).toBe(true);
    const sub = move(base, 'children', { zone: 'section', section: 0, index: 2 }).doc;
    expect(readPreset(yamlOf(YAML, preset, 'bug', base, sub)).ok).toBe(true);
  });

  it('offers a hidden block again', () => {
    const base = docOf(read(), 'bug');
    const placed = move(base, 'log', { zone: 'section', section: 0, index: 0 }).doc;
    expect(shown(placed, 'log', 'detail')).toBe(true);
    const hidden = move(placed, 'log', { zone: 'panel', index: 0 }).doc;
    expect(shown(hidden, 'log', 'detail')).toBe(false);
  });
});
