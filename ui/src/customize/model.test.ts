import { expect, it } from 'vitest';
import { readPreset } from '../../../src/core/preset.ts';
import {
  addField,
  changesOf,
  commit,
  docOf,
  keyOf,
  move,
  redo,
  refusal,
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
  expect(doc.zones.body).toEqual(['description', 'environment']);
  expect(doc.things.description?.kind).toBe('long');
});

it('refuses long text beside the title', () => {
  expect(refusal('long', 'header')).toMatch(/Brief/);
  expect(refusal('short', 'header')).toBeUndefined();
  expect(refusal('long', 'row')).toBeDefined();
});

it('moves within the detail and writes the plain words', () => {
  const base = docOf(read(), 'bug');
  const { doc } = move(base, 'environment', { zone: 'side', index: 0 });
  expect(doc.zones.body).toEqual(['description']);
  expect(changesOf(base, doc)[0]?.text).toBe('Environment moved from Brief to Details');
  expect(move(base, 'description', { zone: 'side', index: 0 }).refused).toMatch(/Brief/);
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
