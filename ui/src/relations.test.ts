import { describe, expect, it } from 'vitest';
import type { NodeKind } from './node-kind.ts';
import {
  childSegments,
  childTally,
  groupRelations,
  LINK_CHOICES,
  linkRequestOf,
  matchItems,
  openLabel,
  unlinkRequestOf,
} from './relations.ts';
import type { Item, RelatedItem } from './types.ts';

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

  it('offers every kind as read from this item', () => {
    expect(LINK_CHOICES.map(({ kind }) => kind)).toEqual([
      'parent',
      'child',
      'blocks',
      'blocked_by',
      'duplicates',
      'duplicated_by',
      'implements',
      'implemented_by',
      'relates',
    ]);
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

describe('matchItems', () => {
  const item = (id: string, title: string) => ({ id, title }) as Item;
  const items = [
    item('BUGS-1', 'Login fails'),
    item('BUGS-2', 'Logo blurry'),
    item('TASKS-1', 'Write docs'),
  ];

  it('finds items by id or title, ignoring case', () => {
    expect(matchItems(items, 'log', []).map(({ id }) => id)).toEqual(['BUGS-1', 'BUGS-2']);
    expect(matchItems(items, 'tasks-1', []).map(({ id }) => id)).toEqual(['TASKS-1']);
  });

  it('puts an exact id first and leaves out the excluded', () => {
    const found = matchItems([...items, item('BUGS-12', 'Crash')], 'bugs-1', ['BUGS-2']);

    expect(found.map(({ id }) => id)).toEqual(['BUGS-1', 'BUGS-12']);
  });

  it('finds nothing for a blank query, and at most the limit', () => {
    expect(matchItems(items, '  ', [])).toEqual([]);
    expect(matchItems(items, 'o', [], 2)).toHaveLength(2);
  });
});

describe('openLabel', () => {
  it('says how many of the children are still open', () => {
    expect(openLabel({ total: 4, open: 3, done: 1, discarded: 0 })).toBe('3 of 4 open');
    expect(openLabel({ total: 2, open: 0, done: 1, discarded: 1 })).toBe('0 of 2 open');
  });
});

describe('childSegments and childTally', () => {
  const kinds: NodeKind[] = ['queued', 'you', 'discarded', 'working', 'done', 'incomplete'];

  it('orders the bar closed first, then yours, then the agents at work, then waiting', () => {
    expect(childSegments(kinds)).toEqual([
      'done',
      'discarded',
      'you',
      'working',
      'queued',
      'incomplete',
    ]);
  });

  it('counts the legend: yours, with agents, closed', () => {
    expect(childTally(kinds)).toEqual({ yours: 1, agents: 3, closed: 2 });
    expect(childTally([])).toEqual({ yours: 0, agents: 0, closed: 0 });
  });
});
