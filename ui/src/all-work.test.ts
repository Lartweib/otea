import { describe, expect, it } from 'vitest';
import { allWork, workTree } from './all-work.ts';
import type { Folds } from './nesting.ts';
import type { Item, RelationRef, Turn } from './types.ts';

const item = (id: string, turn: Turn, relations: RelationRef[] = [], updatedAt = '2026-01-01') =>
  ({
    id,
    collection: id.split('-')[0]?.toLowerCase(),
    title: `Title of ${id}`,
    turn,
    updatedAt,
    ...(relations.length > 0 ? { relations } : {}),
  }) as Item;

const parent = (id: string): RelationRef => ({ kind: 'parent', id });
const blocks = (id: string): RelationRef => ({ kind: 'blocks', id });
const implementsIt = (id: string): RelationRef => ({ kind: 'implements', id });
const relates = (id: string): RelationRef => ({ kind: 'relates', id });

const folds = (collapsed: string[] = [], expanded: string[] = []): Folds => ({
  collapsed: new Set(collapsed),
  expanded: new Set(expanded),
});

// Each root and what sits under it, as `ID` or `via:ID`, nested.
type Shape = string | [string, Shape[]];
const shape = (nodes: ReturnType<typeof workTree>): Shape[] =>
  nodes.map((node) => {
    const name = node.via && node.via !== 'child' ? `${node.via}:${node.item.id}` : node.item.id;
    return node.nodes.length > 0 ? [name, shape(node.nodes)] : name;
  });

describe('workTree', () => {
  it('roots the items with no parent, and nests children of the same collection', () => {
    const items = [
      item('TRABAJO-1', 'agent'),
      item('TRABAJO-2', 'agent', [parent('TRABAJO-1')]),
      item('TRABAJO-3', 'agent', [parent('TRABAJO-2')]),
      item('TRABAJO-4', 'human'),
    ];

    expect(shape(workTree(items))).toEqual([
      ['TRABAJO-1', [['TRABAJO-2', ['TRABAJO-3']]]],
      'TRABAJO-4',
    ]);
  });

  it('roots an item whose parent sits in another collection', () => {
    const items = [item('EPICS-1', 'agent'), item('PARTS-1', 'agent', [parent('EPICS-1')])];

    expect(shape(workTree(items))).toEqual(['EPICS-1', 'PARTS-1']);
  });

  it('puts a blocker and an implementer under what they block or implement, from any collection', () => {
    const items = [
      item('BUGS-7', 'agent', [blocks('TRABAJO-3')]),
      item('TRABAJO-3', 'agent'),
      item('ARTE-4', 'human', [implementsIt('TRABAJO-3')]),
      item('TRABAJO-9', 'agent', [blocks('TRABAJO-3')]),
    ];

    expect(shape(workTree(items))).toEqual([
      ['TRABAJO-3', ['blocked_by:BUGS-7', 'blocked_by:TRABAJO-9', 'implemented_by:ARTE-4']],
    ]);
  });

  it('lists children first, then blockers, then implementers', () => {
    const items = [
      item('ARTE-1', 'agent', [implementsIt('TRABAJO-1')]),
      item('BUGS-1', 'agent', [blocks('TRABAJO-1')]),
      item('TRABAJO-2', 'agent', [parent('TRABAJO-1')]),
      item('TRABAJO-1', 'agent'),
    ];

    expect(shape(workTree(items))).toEqual([
      ['TRABAJO-1', ['TRABAJO-2', 'blocked_by:BUGS-1', 'implemented_by:ARTE-1']],
    ]);
  });

  it('roots an item that blocks or implements only what is not listed', () => {
    expect(shape(workTree([item('BUGS-1', 'agent', [blocks('TRABAJO-99')])]))).toEqual(['BUGS-1']);
  });

  it('repeats an item reached twice, the second time as a leaf that says where it first sits', () => {
    const items = [
      item('TRABAJO-1', 'agent'),
      item('TRABAJO-2', 'agent'),
      item('BUGS-1', 'agent', [blocks('TRABAJO-1'), blocks('TRABAJO-2')]),
      item('BUGS-2', 'agent', [blocks('BUGS-1')]),
    ];
    const tree = workTree(items);

    expect(shape(tree)).toEqual([
      ['TRABAJO-1', [['blocked_by:BUGS-1', ['blocked_by:BUGS-2']]]],
      ['TRABAJO-2', ['blocked_by:BUGS-1']],
    ]);
    const first = tree[0]?.nodes[0];
    const again = tree[1]?.nodes[0];
    expect(first?.key).toBe('BUGS-1');
    expect(first?.alsoUnder).toBeUndefined();
    expect(again?.key).not.toBe('BUGS-1');
    expect(again?.alsoUnder).toBe('TRABAJO-1');
  });

  it('still shows items whose links loop, from the first of them listed', () => {
    const items = [
      item('ARTE-1', 'agent', [implementsIt('ARTE-2')]),
      item('ARTE-2', 'agent', [implementsIt('ARTE-1')]),
    ];

    expect(shape(workTree(items))).toEqual([['ARTE-1', ['implemented_by:ARTE-2']]]);
  });

  it('keeps every row key unique', () => {
    const items = [
      item('TRABAJO-1', 'agent'),
      item('TRABAJO-2', 'agent', [parent('TRABAJO-1'), blocks('TRABAJO-1')]),
    ];
    const keys: string[] = [];
    const walk = (nodes: ReturnType<typeof workTree>) => {
      for (const node of nodes) {
        keys.push(node.key);
        walk(node.nodes);
      }
    };
    walk(workTree(items));

    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3);
  });
});

describe('allWork', () => {
  const items = [
    item('TRABAJO-1', 'agent'),
    item('TRABAJO-2', 'human', [parent('TRABAJO-1')]),
    item('BUGS-1', 'agent', [blocks('TRABAJO-1'), relates('ARTE-1')]),
    item('ARTE-1', 'human', [relates('BUGS-1')]),
    item('TRABAJO-3', 'none', [], '2026-01-02'),
    item('TRABAJO-4', 'none', [], '2026-01-03'),
  ];

  const rowsOf = (result: ReturnType<typeof allWork>) =>
    result.sections.map((section) => section.keys ?? section.items.map(({ id }) => id));

  it('groups the roots by turn, and their rows travel with them', () => {
    const result = allWork(items, folds());

    expect(result.sections.map(({ key }) => key)).toEqual(['human', 'agent', 'none']);
    expect(rowsOf(result)).toEqual([
      ['ARTE-1'],
      ['TRABAJO-1', 'TRABAJO-2', 'BUGS-1'],
      ['TRABAJO-4', 'TRABAJO-3'],
    ]);
    expect(result.sections.map(({ total }) => total)).toEqual([1, 1, 2]);
  });

  it('counts the rows of yours under roots of another turn', () => {
    const result = allWork(items, folds());

    expect(result.sections.map(({ yoursInside }) => yoursInside ?? 0)).toEqual([0, 1, 0]);
  });

  it('says how each row sits: its depth, how it is linked, and how many it relates to', () => {
    const { rows } = allWork(items, folds());

    expect(rows.get('TRABAJO-1')).toEqual({ depth: 0, nested: 2, collapsed: false });
    expect(rows.get('TRABAJO-2')).toEqual({ depth: 1 });
    expect(rows.get('BUGS-1')).toEqual({ depth: 1, via: 'blocked_by', relates: 1 });
    expect(rows.get('ARTE-1')).toEqual({ depth: 0, relates: 1 });
  });

  it('folds a root the viewer collapsed, still counting the yours it hides', () => {
    const result = allWork(items, folds(['TRABAJO-1']));

    expect(rowsOf(result)[1]).toEqual(['TRABAJO-1']);
    expect(result.rows.get('TRABAJO-1')?.collapsed).toBe(true);
    expect(result.sections[1]?.yoursInside).toBe(1);
  });

  it('folds a root whose rows are all closed, unless the viewer unfolded it', () => {
    const settled = [item('TRABAJO-1', 'agent'), item('TRABAJO-2', 'none', [parent('TRABAJO-1')])];

    expect(rowsOf(allWork(settled, folds()))[1]).toEqual(['TRABAJO-1']);
    expect(allWork(settled, folds()).rows.get('TRABAJO-1')).toEqual({
      depth: 0,
      nested: 1,
      collapsed: true,
      settled: true,
    });
    expect(rowsOf(allWork(settled, folds([], ['TRABAJO-1'])))[1]).toEqual([
      'TRABAJO-1',
      'TRABAJO-2',
    ]);
  });

  it('marks a repeated row with where it first sits', () => {
    const twice = [
      item('TRABAJO-1', 'agent'),
      item('TRABAJO-2', 'agent'),
      item('BUGS-1', 'agent', [blocks('TRABAJO-1'), blocks('TRABAJO-2')]),
    ];
    const result = allWork(twice, folds());
    const keys = rowsOf(result)[1] ?? [];
    const repeated = keys[3] ?? '';

    expect(keys.slice(0, 3)).toEqual(['TRABAJO-1', 'BUGS-1', 'TRABAJO-2']);
    expect(result.sections[1]?.items.map(({ id }) => id)).toEqual([
      'TRABAJO-1',
      'BUGS-1',
      'TRABAJO-2',
      'BUGS-1',
    ]);
    expect(result.rows.get(repeated)).toEqual({
      depth: 1,
      via: 'blocked_by',
      alsoUnder: 'TRABAJO-1',
    });
  });

  it('names the parent of a root that sits in another collection', () => {
    const across = [item('EPICS-1', 'agent'), item('PARTS-1', 'agent', [parent('EPICS-1')])];

    expect(allWork(across, folds()).rows.get('PARTS-1')).toEqual({
      depth: 0,
      parent: { id: 'EPICS-1', title: 'Title of EPICS-1' },
    });
  });
});
