import { describe, expect, it } from 'vitest';
import {
  detailBlocks,
  intakeFields,
  intakeSlots,
  intakeTypes,
  rowValues,
  showsTypes,
  slotData,
  takesChildren,
  typeMark,
  typeOf,
} from './item-types.ts';
import type { CollectionView, FieldView, Layout, TypeView } from './types.ts';

const title: FieldView = { name: 'title', module: 'text', required: 'create' };
const severity: FieldView = { name: 'severity', module: 'severity', required: 'create' };
const area: FieldView = { name: 'area', module: 'text' };
const pitch: FieldView = { name: 'pitch', module: 'markdown' };

const EMPTY: Layout = {
  header: [],
  evidence: [],
  body: [],
  side: [],
  row: [],
  phone: [],
  intake: [],
};

const entry = ({ name, module }: FieldView) => ({ module, field: name }) as Layout['body'][number];

const shots = { module: 'images', id: 'shots', variant: 'compare' } as const;
const recording = { module: 'recording', id: 'recording' } as const;

const bug: TypeView = {
  name: 'bug',
  label: 'Bug',
  initial: 'reported',
  states: [],
  fields: [title, area, severity],
  layout: {
    ...EMPTY,
    header: [entry(severity)],
    evidence: [shots],
    body: [{ ...entry(area), label: 'Where' }, { module: 'questions' }],
    side: [entry(severity), recording],
    row: [entry(severity)],
    intake: [entry(title), entry(severity)],
  },
};

const impr: TypeView = {
  name: 'impr',
  label: 'Improvement',
  initial: 'idea',
  states: [],
  fields: [title, area, pitch],
  layout: { ...EMPTY, body: [entry(pitch)], intake: [entry(title), entry(pitch)] },
};

// Where the layout of a type places something: its slot, and its index there.
const at = (type: string, slot: string, index: number, field?: string) => ({
  type,
  slot,
  index,
  ...(field === undefined ? {} : { field }),
});

const work: CollectionView = {
  name: 'work',
  prefix: 'WORK',
  preset: 'work',
  icon: null,
  types: [bug, impr],
  view: { kind: 'list', groupBy: 'turn', columns: ['id', 'title', 'state', 'who', 'age'] },
};

describe('item types', () => {
  it('finds the type of an item in its collection', () => {
    expect(typeOf(work, 'impr')).toBe(impr);
    expect(typeOf(work, 'epic')).toBeUndefined();
    expect(typeOf(undefined, 'bug')).toBeUndefined();
  });

  it('marks types only in a collection that has several', () => {
    expect(showsTypes(work)).toBe(true);
    expect(showsTypes({ ...work, types: [bug] })).toBe(false);
    expect(showsTypes(undefined)).toBe(false);
  });

  it('names the type by its icon and word, by its tag without an icon, or not at all', () => {
    const iconic = { ...bug, icon: 'bug' };
    expect(typeMark({ ...work, types: [iconic, impr] }, 'bug')).toEqual({
      kind: 'icon',
      icon: 'bug',
      word: 'bug',
    });
    expect(typeMark(work, 'impr')).toEqual({ kind: 'tag', name: 'impr', label: 'Improvement' });
    // A preset that names its only type says its word; one without types, its own name.
    expect(typeMark({ ...work, preset: 'bug-triage', types: [iconic] }, 'bug')).toEqual({
      kind: 'icon',
      icon: 'bug',
      word: 'bug',
    });
    const implicit = { ...iconic, name: 'item', label: 'Item' };
    expect(typeMark({ ...work, preset: 'notes', types: [implicit] }, 'item')).toEqual({
      kind: 'icon',
      icon: 'bug',
      word: 'notes',
    });
    expect(typeMark({ ...work, types: [bug] }, 'bug')).toBeNull();
    expect(typeMark(undefined, 'bug')).toBeNull();
  });

  describe('hierarchy', () => {
    const epic: TypeView = {
      ...impr,
      name: 'epic',
      label: 'Epic',
      children: ['story', 'bug'],
      root: true,
    };
    const story: TypeView = {
      ...impr,
      name: 'story',
      label: 'Story',
      children: ['bug'],
      root: false,
    };
    const leaf: TypeView = { ...bug, children: [], root: true };
    const board: CollectionView = { ...work, name: 'board', types: [epic, story, leaf] };

    it('offers under a parent only the types its type takes', () => {
      expect(intakeTypes(board, epic).map(({ name }) => name)).toEqual(['story', 'bug']);
      expect(intakeTypes(board, story).map(({ name }) => name)).toEqual(['bug']);
      expect(intakeTypes(board, leaf)).toEqual([]);
    });

    it('offers without a parent only the types that stand alone', () => {
      expect(intakeTypes(board, undefined).map(({ name }) => name)).toEqual(['epic', 'bug']);
    });

    it('offers every type of a preset without a hierarchy', () => {
      expect(intakeTypes(work, bug)).toEqual([bug, impr]);
      expect(intakeTypes(work, undefined)).toEqual([bug, impr]);
    });

    it('takes children unless the hierarchy gives the type none', () => {
      expect([epic, story, leaf, bug, undefined].map(takesChildren)).toEqual([
        true,
        true,
        false,
        true,
        true,
      ]);
    });
  });

  it('asks for the fields of the intake slot, in its order', () => {
    expect(intakeFields(bug)).toEqual([title, severity]);
  });

  it('places each intake field at its index in the slot', () => {
    expect(intakeSlots(bug)).toEqual([
      { field: title, at: at('bug', 'intake', 0, 'title') },
      { field: severity, at: at('bug', 'intake', 1, 'severity') },
    ]);
  });

  it('turns a place into the data attributes a rendered part carries', () => {
    expect(slotData(at('bug', 'body', 2, 'area') as never)).toEqual({
      'data-type': 'bug',
      'data-slot': 'body',
      'data-index': '2',
      'data-field': 'area',
    });
    expect(slotData(at('bug', 'evidence', 0) as never)).toEqual({
      'data-type': 'bug',
      'data-slot': 'evidence',
      'data-index': '0',
    });
    expect(slotData(undefined)).toEqual({});
  });

  it('puts the values of the row slot in the row', () => {
    expect(rowValues(bug, { area: 'Login', severity: 'high' })).toEqual([
      { field: severity, value: 'high', label: 'Severity', at: at('bug', 'row', 0, 'severity') },
    ]);
  });

  it('puts every value in the row while the type is unknown', () => {
    expect(rowValues(undefined, { area: 'Login' })).toEqual([
      { field: { name: 'area', module: 'text' }, value: 'Login', label: 'area' },
    ]);
  });

  describe('detailBlocks', () => {
    it('lays out the head, the primary column in slot order and the side', () => {
      const blocks = detailBlocks(bug, { area: 'Login', severity: 'high' });

      expect(blocks.head).toEqual([
        {
          field: severity,
          value: 'high',
          label: 'Severity',
          at: at('bug', 'header', 0, 'severity'),
        },
      ]);
      expect(blocks.primary).toEqual([
        { kind: 'module', entry: shots, at: at('bug', 'evidence', 0) },
        {
          kind: 'fields',
          values: [
            { field: area, value: 'Login', label: 'Where', at: at('bug', 'body', 0, 'area') },
          ],
        },
        { kind: 'evidence' },
      ]);
      expect(blocks.side).toEqual([
        {
          kind: 'fields',
          values: [
            {
              field: severity,
              value: 'high',
              label: 'Severity',
              at: at('bug', 'side', 0, 'severity'),
            },
          ],
        },
        { kind: 'module', entry: recording, at: at('bug', 'side', 1) },
      ]);
    });

    it('keeps the plain evidence list after the fields', () => {
      expect(detailBlocks(impr, { pitch: 'Cache it' }).primary).toEqual([
        {
          kind: 'fields',
          values: [
            { field: pitch, value: 'Cache it', label: 'Pitch', at: at('impr', 'body', 0, 'pitch') },
          ],
        },
        { kind: 'evidence' },
      ]);
    });

    it('skips fields without a value, and still shows values the type does not declare', () => {
      expect(detailBlocks(impr, { owner: 'ana' }).primary).toEqual([
        {
          kind: 'fields',
          values: [{ field: { name: 'owner', module: 'text' }, value: 'ana', label: 'owner' }],
        },
        { kind: 'evidence' },
      ]);
    });

    it('places the relation modules where the layout puts them', () => {
      const parts: TypeView = {
        ...impr,
        layout: {
          ...impr.layout,
          body: [entry(pitch), { module: 'children', label: 'Parts' }],
          side: [{ module: 'relations' }],
        },
      };

      const blocks = detailBlocks(parts, { pitch: 'Wolf' });

      expect(blocks.primary).toEqual([
        {
          kind: 'fields',
          values: [
            { field: pitch, value: 'Wolf', label: 'Pitch', at: at('impr', 'body', 0, 'pitch') },
          ],
        },
        {
          kind: 'relation',
          entry: { module: 'children', label: 'Parts' },
          at: at('impr', 'body', 1),
        },
        { kind: 'evidence' },
      ]);
      expect(blocks.side).toEqual([
        { kind: 'relation', entry: { module: 'relations' }, at: at('impr', 'side', 0) },
      ]);
    });

    it('shows every value in the body and the relations aside while the type is unknown', () => {
      expect(detailBlocks(undefined, { area: 'Login' })).toEqual({
        head: [],
        primary: [
          {
            kind: 'fields',
            values: [{ field: { name: 'area', module: 'text' }, value: 'Login', label: 'area' }],
          },
          { kind: 'evidence' },
        ],
        side: [{ kind: 'relation', entry: { module: 'relations' } }],
      });
    });
  });
});
