import { describe, expect, it } from 'vitest';
import { rawOf, readDraft } from './draft.ts';
import {
  fieldPath,
  layoutPath,
  moveInSlot,
  removeField,
  renameField,
  setShownIn,
  sharedBy,
  shownIn,
  slotChoices,
} from './layout-edit.ts';

const PRESET = `preset: game-bugs
preset_version: 3
fields:
  title: { module: text, required: create }
  description: { module: markdown, required: complete }
  # How bad it is.
  severity: { module: severity, required: complete }
  area: { module: text }
workflow:
  initial: open
  incomplete: draft
  states:
    draft: { turn: agent }
    open: { turn: human }
    done: { turn: none, closes: done }
  transitions:
    - { from: draft, to: open, by: agent }
    - { from: open, to: done, by: human-ui }
types:
  bug:
    label: Bug
    layout:
      header: [severity]
      body: [description]
      row: [severity, area]
  improvement:
    label: Improvement
    fields:
      benefit: { module: markdown }
labels:
  es:
    types: { bug: Error, improvement: Mejora }
    states: { draft: borrador, open: abierto, done: hecho }
    fields: { title: título, description: descripción, severity: gravedad, area: área, benefit: beneficio }
`;

const slotIn = (yaml: string, slot: string) =>
  (rawOf(yaml).types?.bug?.layout as Record<string, unknown> | undefined)?.[slot];

function read(yaml: string) {
  const reading = readDraft(yaml);
  if (!reading.ok) throw new Error(reading.problems.join('; '));
  return reading.preset;
}

describe('where a field and a layout live in the YAML', () => {
  it('finds a shared field at the top and a type’s own under the type', () => {
    const raw = rawOf(PRESET);
    expect(fieldPath(raw, 'bug', 'severity')).toEqual(['fields', 'severity']);
    expect(fieldPath(raw, 'improvement', 'benefit')).toEqual([
      'types',
      'improvement',
      'fields',
      'benefit',
    ]);
  });

  it('puts a type’s layout under the type, and the layout of a preset without types at the top', () => {
    expect(layoutPath(rawOf(PRESET), 'bug')).toEqual(['types', 'bug', 'layout']);
    expect(layoutPath(rawOf('preset: notes\npreset_version: 1\n'), 'item')).toEqual(['layout']);
  });

  it('says which types share a field', () => {
    const raw = rawOf(PRESET);
    expect(sharedBy(raw, 'severity')).toEqual(['bug', 'improvement']);
    expect(sharedBy(raw, 'benefit')).toEqual(['improvement']);
  });
});

describe('placing a field in the slots', () => {
  it('reads the slots a field shows in, from the layout the core reads', () => {
    expect(shownIn(read(PRESET), 'bug', 'severity')).toEqual(['header', 'row', 'intake']);
  });

  it('offers the slots a field module may sit in, and strikes evidence with its reason', () => {
    const choices = slotChoices('severity');
    expect(choices.map(({ slot }) => slot)).toEqual([
      'header',
      'row',
      'intake',
      'body',
      'side',
      'phone',
      'evidence',
    ]);
    expect(choices.find(({ slot }) => slot === 'evidence')?.struck).toBeTruthy();
    expect(choices.find(({ slot }) => slot === 'body')?.struck).toBeUndefined();
  });

  it('adds a field to the end of a slot, keeping the rest of the layout and its comments', () => {
    const next = setShownIn(PRESET, read(PRESET), 'bug', 'area', 'side', true);
    expect(rawOf(next).types?.bug?.layout).toEqual({
      header: ['severity'],
      body: ['description'],
      row: ['severity', 'area'],
      side: [{ module: 'relations' }, 'area'],
    });
    expect(next).toContain('# How bad it is.');
    expect(readDraft(next).ok).toBe(true);
  });

  it('writes the slot the core fills by default before changing it', () => {
    const next = setShownIn(PRESET, read(PRESET), 'bug', 'area', 'intake', false);
    expect(slotIn(next, 'intake')).toEqual(['title', 'description', 'severity']);
  });

  it('takes a field out of a slot', () => {
    const next = setShownIn(PRESET, read(PRESET), 'bug', 'severity', 'header', false);
    expect(slotIn(next, 'header')).toEqual([]);
  });

  it('moves an entry inside a slot', () => {
    const next = moveInSlot(PRESET, read(PRESET), 'bug', 'row', 1, 0);
    expect(slotIn(next, 'row')).toEqual(['area', 'severity']);
  });
});

describe('renaming and removing a field', () => {
  it('removes the field, its places in every layout and its labels', () => {
    const next = removeField(PRESET, read(PRESET), 'bug', 'severity');
    const raw = rawOf(next);
    expect(raw.fields?.severity).toBeUndefined();
    expect(slotIn(next, 'row')).toEqual(['area']);
    expect(next).not.toContain('gravedad');
    expect(readDraft(next).ok).toBe(true);
  });

  it('renames the field where the preset names it: its key, the layouts and the labels', () => {
    const next = renameField(PRESET, read(PRESET), 'bug', 'area', 'zone');
    const raw = rawOf(next);
    expect(raw.fields?.zone).toEqual({ module: 'text' });
    expect(slotIn(next, 'row')).toEqual(['severity', 'zone']);
    expect(next).toContain('zone: área');
    expect(readDraft(next).ok).toBe(true);
  });
});
