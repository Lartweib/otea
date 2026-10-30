import { describe, expect, it } from 'vitest';
import { detailBlocks, intakeFields, rowValues, showsTypes, typeOf } from './item-types.ts';
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

const work: CollectionView = {
  name: 'work',
  prefix: 'WORK',
  preset: 'work',
  types: [bug, impr],
  view: { kind: 'list', groupBy: 'turn' },
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

  it('asks for the fields of the intake slot, in its order', () => {
    expect(intakeFields(bug)).toEqual([title, severity]);
  });

  it('puts the values of the row slot in the row', () => {
    expect(rowValues(bug, { area: 'Login', severity: 'high' })).toEqual([
      { field: severity, value: 'high', label: 'severity' },
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

      expect(blocks.head).toEqual([{ field: severity, value: 'high', label: 'severity' }]);
      expect(blocks.primary).toEqual([
        { kind: 'module', entry: shots },
        { kind: 'fields', values: [{ field: area, value: 'Login', label: 'Where' }] },
        { kind: 'evidence' },
      ]);
      expect(blocks.side).toEqual([
        { kind: 'fields', values: [{ field: severity, value: 'high', label: 'severity' }] },
        { kind: 'module', entry: recording },
      ]);
    });

    it('keeps the plain evidence list after the fields', () => {
      expect(detailBlocks(impr, { pitch: 'Cache it' }).primary).toEqual([
        { kind: 'fields', values: [{ field: pitch, value: 'Cache it', label: 'pitch' }] },
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

    it('shows every value in the body while the type is unknown', () => {
      expect(detailBlocks(undefined, { area: 'Login' })).toEqual({
        head: [],
        primary: [
          {
            kind: 'fields',
            values: [{ field: { name: 'area', module: 'text' }, value: 'Login', label: 'area' }],
          },
          { kind: 'evidence' },
        ],
        side: [],
      });
    });
  });
});
