import { describe, expect, it } from 'vitest';
import { OteaError } from './errors.ts';
import {
  assertCanRelate,
  assertChildrenClosed,
  childrenSummary,
  describeRelation,
  matchesRelation,
  normalizeRelation,
  orderByBlocks,
  parseRelationKind,
  type Relation,
  viewOf,
} from './relations.ts';

const rel = (from: string, kind: Relation['kind'], to: string): Relation => ({ kind, from, to });

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof OteaError) return error.code;
    throw error;
  }
  return undefined;
}

describe('parseRelationKind', () => {
  it.each(['parent', 'blocks', 'duplicates', 'implements', 'relates'])('accepts %s', (kind) => {
    expect(parseRelationKind(kind)).toBe(kind);
  });

  it.each(['child', 'blocked_by', 'Parent', ''])('refuses %j with invalid_relation', (kind) => {
    expect(codeOf(() => parseRelationKind(kind))).toBe('invalid_relation');
  });
});

describe('normalizeRelation', () => {
  it('keeps the direction of a directed kind', () => {
    expect(normalizeRelation(rel('B-2', 'blocks', 'B-1'))).toEqual(rel('B-2', 'blocks', 'B-1'));
  });

  it('stores a symmetric relation once, whichever way it is given', () => {
    expect(normalizeRelation(rel('B-2', 'relates', 'B-1'))).toEqual(rel('B-1', 'relates', 'B-2'));
    expect(normalizeRelation(rel('B-1', 'relates', 'B-2'))).toEqual(rel('B-1', 'relates', 'B-2'));
  });
});

describe('matchesRelation', () => {
  it('matches a directed relation only in its direction', () => {
    expect(matchesRelation(rel('A-1', 'blocks', 'A-2'), rel('A-1', 'blocks', 'A-2'))).toBe(true);
    expect(matchesRelation(rel('A-1', 'blocks', 'A-2'), rel('A-2', 'blocks', 'A-1'))).toBe(false);
  });

  it('matches a symmetric relation either way', () => {
    expect(matchesRelation(rel('A-1', 'relates', 'A-2'), rel('A-2', 'relates', 'A-1'))).toBe(true);
  });
});

describe('viewOf', () => {
  it.each([
    [rel('W-2', 'parent', 'W-1'), 'W-2', 'parent', 'W-1'],
    [rel('W-2', 'parent', 'W-1'), 'W-1', 'child', 'W-2'],
    [rel('W-2', 'blocks', 'W-3'), 'W-2', 'blocks', 'W-3'],
    [rel('W-2', 'blocks', 'W-3'), 'W-3', 'blocked_by', 'W-2'],
    [rel('B-2', 'duplicates', 'B-1'), 'B-1', 'duplicated_by', 'B-2'],
    [rel('B-2', 'implements', 'S-1'), 'S-1', 'implemented_by', 'B-2'],
    [rel('B-1', 'relates', 'B-2'), 'B-2', 'relates', 'B-1'],
  ] as const)('reads %j from %s as %s %s', (relation, id, kind, other) => {
    expect(viewOf(relation, id)).toEqual({ kind, id: other });
  });
});

describe('describeRelation', () => {
  it.each([
    [rel('W-2', 'parent', 'W-1'), 'W-2 is a child of W-1'],
    [rel('W-2', 'blocks', 'W-3'), 'W-2 blocks W-3'],
    [rel('B-2', 'duplicates', 'B-1'), 'B-2 duplicates B-1'],
    [rel('B-2', 'implements', 'S-1'), 'B-2 implements S-1'],
    [rel('B-1', 'relates', 'B-2'), 'B-1 relates to B-2'],
  ])('describes %j', (relation, text) => {
    expect(describeRelation(relation)).toBe(text);
  });
});

describe('assertCanRelate', () => {
  const check = (existing: Relation[], next: Relation) =>
    codeOf(() => assertCanRelate(existing, next));

  it('accepts a first relation', () => {
    expect(check([], rel('W-2', 'parent', 'W-1'))).toBeUndefined();
  });

  it('refuses an item related to itself', () => {
    expect(check([], rel('W-1', 'relates', 'W-1'))).toBe('self_relation');
  });

  it('refuses the same relation twice, and a symmetric one given the other way', () => {
    const existing = [rel('W-2', 'blocks', 'W-3'), rel('W-1', 'relates', 'W-4')];

    expect(check(existing, rel('W-2', 'blocks', 'W-3'))).toBe('already_exists');
    expect(check(existing, rel('W-4', 'relates', 'W-1'))).toBe('already_exists');
  });

  it('refuses a second link of the same pair in the other direction', () => {
    expect(check([rel('B-2', 'duplicates', 'B-1')], rel('B-1', 'duplicates', 'B-2'))).toBe(
      'already_exists',
    );
  });

  it('allows different kinds between the same pair', () => {
    expect(check([rel('W-2', 'blocks', 'W-3')], rel('W-2', 'relates', 'W-3'))).toBeUndefined();
  });

  it('refuses a second parent', () => {
    expect(check([rel('W-2', 'parent', 'W-1')], rel('W-2', 'parent', 'W-9'))).toBe('parent_exists');
  });

  it('allows a parent many children', () => {
    expect(check([rel('W-2', 'parent', 'W-1')], rel('W-3', 'parent', 'W-1'))).toBeUndefined();
  });

  it('refuses a parent cycle, direct or through ancestors', () => {
    const tree = [rel('W-2', 'parent', 'W-1'), rel('W-3', 'parent', 'W-2')];

    expect(check(tree, rel('W-1', 'parent', 'W-2'))).toBe('relation_cycle');
    expect(check(tree, rel('W-1', 'parent', 'W-3'))).toBe('relation_cycle');
  });

  it('refuses a blocks cycle, and names its path', () => {
    const chain = [rel('W-2', 'blocks', 'W-3'), rel('W-3', 'blocks', 'W-4')];

    expect(check(chain, rel('W-3', 'blocks', 'W-2'))).toBe('relation_cycle');
    expect(check(chain, rel('W-4', 'blocks', 'W-2'))).toBe('relation_cycle');
    expect(() => assertCanRelate(chain, rel('W-4', 'blocks', 'W-2'))).toThrow(
      'W-2 blocks W-3, W-3 blocks W-4',
    );
  });

  it('does not mix kinds when it looks for cycles', () => {
    const existing = [rel('W-2', 'blocks', 'W-3'), rel('W-3', 'parent', 'W-2')];

    expect(check(existing, rel('W-4', 'blocks', 'W-2'))).toBeUndefined();
  });
});

describe('orderByBlocks', () => {
  it('keeps the order given when nothing blocks', () => {
    expect(orderByBlocks(['A', 'B', 'C'], [])).toEqual(['A', 'B', 'C']);
  });

  it('puts what blocks before what it blocks', () => {
    expect(orderByBlocks(['A', 'B', 'C'], [rel('C', 'blocks', 'A')])).toEqual(['C', 'A', 'B']);
  });

  it('is stable: ready items keep their order', () => {
    const blocks = [rel('D', 'blocks', 'B'), rel('C', 'blocks', 'B')];

    expect(orderByBlocks(['A', 'B', 'C', 'D'], blocks)).toEqual(['A', 'C', 'D', 'B']);
  });

  it('follows chains', () => {
    const chain = [rel('C', 'blocks', 'B'), rel('B', 'blocks', 'A')];

    expect(orderByBlocks(['A', 'B', 'C'], chain)).toEqual(['C', 'B', 'A']);
  });

  it('ignores other kinds and items outside the set', () => {
    const relations = [rel('C', 'parent', 'A'), rel('Z', 'blocks', 'A'), rel('B', 'relates', 'A')];

    expect(orderByBlocks(['A', 'B', 'C'], relations)).toEqual(['A', 'B', 'C']);
  });

  it('never loses an item to a cycle: what is caught in one keeps its order, at the end', () => {
    const cycle = [rel('A', 'blocks', 'B'), rel('B', 'blocks', 'A'), rel('D', 'blocks', 'C')];

    expect(orderByBlocks(['A', 'B', 'C', 'D'], cycle)).toEqual(['D', 'C', 'A', 'B']);
  });

  it('lists each item once', () => {
    expect(orderByBlocks(['A', 'A', 'B'], [rel('B', 'blocks', 'A')])).toEqual(['B', 'A']);
  });
});

describe('childrenSummary', () => {
  it('counts open and closed children, by how they closed', () => {
    const children = [{}, { closes: 'done' as const }, { closes: 'discarded' as const }, {}];

    expect(childrenSummary(children)).toEqual({ total: 4, open: 2, done: 1, discarded: 1 });
  });

  it('is all zeros without children', () => {
    expect(childrenSummary([])).toEqual({ total: 0, open: 0, done: 0, discarded: 0 });
  });
});

describe('assertChildrenClosed', () => {
  it('lets a parent close when every child is closed', () => {
    const children = [{ id: 'P-2', state: 'done', closes: 'done' as const }];

    expect(codeOf(() => assertChildrenClosed('W-1', 'done', children))).toBeUndefined();
  });

  it('refuses while a child is open, naming each open one with its state', () => {
    const children = [
      { id: 'P-2', state: 'done', closes: 'done' as const },
      { id: 'P-3', state: 'todo' },
      { id: 'P-4', state: 'review' },
    ];
    const close = () => assertChildrenClosed('W-1', 'done', children);

    expect(codeOf(close)).toBe('children_open');
    expect(close).toThrow(
      'W-1 cannot move to "done" while 2 of its 3 children are open: P-3 (todo), P-4 (review)',
    );
  });
});
