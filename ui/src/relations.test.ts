import { describe, expect, it } from 'vitest';
import { groupRelations, linkRequestOf, openLabel, unlinkRequestOf } from './relations.ts';
import type { RelatedItem } from './types.ts';

const related = (kind: RelatedItem['kind'], id: string, extra: Partial<RelatedItem> = {}) =>
  ({
    kind,
    id,
    collection: 'parts',
    type: 'item',
    title: id,
    state: 'todo',
    turn: 'agent',
    lease: null,
    ...extra,
  }) as RelatedItem;

describe('groupRelations', () => {
  it('groups by kind in a fixed order, with the labels people read', () => {
    const relations = [
      related('blocked_by', 'P-1'),
      related('parent', 'E-1'),
      related('child', 'P-7'),
      related('relates', 'B-2'),
      related('blocked_by', 'P-3'),
    ];

    expect(
      groupRelations(relations).map(({ kind, label, items }) => [
        kind,
        label,
        items.map(({ id }) => id),
      ]),
    ).toEqual([
      ['parent', 'parent', ['E-1']],
      ['child', 'children', ['P-7']],
      ['blocked_by', 'blocked by', ['P-1', 'P-3']],
      ['relates', 'related', ['B-2']],
    ]);
  });

  it('leaves children out when a children module draws them', () => {
    const groups = groupRelations([related('child', 'P-7')], { withChildren: false });

    expect(groups).toEqual([]);
  });
});

describe('linkRequestOf', () => {
  it('sends the kinds read from this item as they are stored', () => {
    expect(linkRequestOf('P-2', 'blocks', 'P-3')).toEqual({
      id: 'P-2',
      kind: 'blocks',
      other: 'P-3',
    });
    expect(linkRequestOf('P-2', 'parent', 'E-1')).toEqual({
      id: 'P-2',
      kind: 'parent',
      other: 'E-1',
    });
  });

  it('turns an inverse kind around', () => {
    expect(linkRequestOf('E-1', 'child', 'P-2')).toEqual({
      id: 'P-2',
      kind: 'parent',
      other: 'E-1',
    });
    expect(linkRequestOf('P-3', 'blocked_by', 'P-2')).toEqual({
      id: 'P-2',
      kind: 'blocks',
      other: 'P-3',
    });
    expect(linkRequestOf('B-1', 'duplicated_by', 'B-4')).toEqual({
      id: 'B-4',
      kind: 'duplicates',
      other: 'B-1',
    });
  });
});

describe('unlinkRequestOf', () => {
  it('names a shown relation the way it was stored', () => {
    expect(unlinkRequestOf('E-1', related('child', 'P-2'))).toEqual({
      id: 'P-2',
      kind: 'parent',
      other: 'E-1',
    });
    expect(unlinkRequestOf('B-1', related('relates', 'B-2'))).toEqual({
      id: 'B-1',
      kind: 'relates',
      other: 'B-2',
    });
  });
});

describe('openLabel', () => {
  // «1 de 1 abiertos» did not say of what (IDEA3-5): it names the parts.
  it('says how many of the parts are not done yet', () => {
    expect(openLabel({ total: 4, open: 3, done: 1, discarded: 0 })).toBe('3 of 4 parts not done');
    expect(openLabel({ total: 2, open: 0, done: 1, discarded: 1 })).toBe('0 of 2 parts not done');
    expect(openLabel({ total: 1, open: 1, done: 0, discarded: 0 })).toBe('1 of 1 part not done');
  });
});
