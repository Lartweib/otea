import { OteaError } from './errors.ts';
import type { Closing } from './workflow.ts';

// Typed links between two items of a project, across collections. Each is stored once, from one
// item to the other: `parent` from the child to its parent, `blocks` from the blocker to what it
// blocks, `duplicates` from the copy to the original, `implements` from the work to what it
// implements. `relates` has no direction.
export const RELATION_KINDS = ['parent', 'blocks', 'duplicates', 'implements', 'relates'] as const;

export type RelationKind = (typeof RELATION_KINDS)[number];

export type Relation = { kind: RelationKind; from: string; to: string };

// How a relation reads from one of its two items: stored kinds from the `from` side, their inverse
// from the `to` side.
export const RELATION_VIEWS = [
  'parent',
  'child',
  'blocks',
  'blocked_by',
  'duplicates',
  'duplicated_by',
  'implements',
  'implemented_by',
  'relates',
] as const;

export type RelationView = (typeof RELATION_VIEWS)[number];

const INVERSE: Readonly<Record<RelationKind, RelationView>> = {
  parent: 'child',
  blocks: 'blocked_by',
  duplicates: 'duplicated_by',
  implements: 'implemented_by',
  relates: 'relates',
};

// Kinds whose links may not loop back: a parent cannot descend from its child, and a blocker cannot
// wait, however far down the chain, on what it blocks.
const ACYCLIC: readonly RelationKind[] = ['parent', 'blocks'];

export function parseRelationKind(kind: string): RelationKind {
  if ((RELATION_KINDS as readonly string[]).includes(kind)) return kind as RelationKind;
  throw new OteaError(
    'invalid_relation',
    `Unknown relation "${kind}" (relations: ${RELATION_KINDS.join(', ')})`,
  );
}

// A symmetric relation is stored with its two ids in order, so either way names the same link.
export function normalizeRelation(relation: Relation): Relation {
  const { kind, from, to } = relation;
  if (kind !== 'relates' || from <= to) return { kind, from, to };
  return { kind, from: to, to: from };
}

export function matchesRelation(stored: Relation, given: Relation): boolean {
  const a = normalizeRelation(stored);
  const b = normalizeRelation(given);
  return a.kind === b.kind && a.from === b.from && a.to === b.to;
}

// A relation as one of its items reads it: the kind seen from that item and the other item's id.
export type RelationRef = { kind: RelationView; id: string };

export function viewOf(relation: Relation, id: string): RelationRef {
  if (relation.from === id) return { kind: relation.kind, id: relation.to };
  return { kind: INVERSE[relation.kind], id: relation.from };
}

export function describeRelation({ kind, from, to }: Relation): string {
  if (kind === 'parent') return `${from} is a child of ${to}`;
  if (kind === 'relates') return `${from} relates to ${to}`;
  return `${from} ${kind} ${to}`;
}

// The links of one kind leading from `start` to `goal`, following each from its `from` to its `to`;
// undefined when there is no such path.
function pathBetween(
  relations: readonly Relation[],
  start: string,
  goal: string,
): Relation[] | undefined {
  const via = new Map<string, Relation>();
  const pending = [start];
  const seen = new Set(pending);
  for (let at = pending.shift(); at !== undefined; at = pending.shift()) {
    if (at === goal) {
      const path: Relation[] = [];
      for (let step = via.get(at); step; step = via.get(step.from)) path.unshift(step);
      return path;
    }
    for (const relation of relations) {
      if (relation.from !== at || seen.has(relation.to)) continue;
      seen.add(relation.to);
      via.set(relation.to, relation);
      pending.push(relation.to);
    }
  }
  return undefined;
}

function sameLink(stored: Relation, next: Relation): boolean {
  if (stored.kind !== next.kind) return false;
  if (matchesRelation(stored, next)) return true;
  // A copy cannot also be the original of its original, nor work implement what implements it.
  return !ACYCLIC.includes(next.kind) && stored.from === next.to && stored.to === next.from;
}

// The rules a new relation must keep, given every relation stored: no item related to itself, one
// link per pair and kind, at most one parent, and no loop in parents or in blocks.
export function assertCanRelate(existing: readonly Relation[], next: Relation): void {
  const { kind, from, to } = next;
  if (from === to) throw new OteaError('self_relation', `${from} cannot be related to itself`);
  const same = existing.find((stored) => sameLink(stored, next));
  if (same) throw new OteaError('already_exists', `Already linked: ${describeRelation(same)}`);
  if (kind === 'parent') {
    const parent = existing.find((stored) => stored.kind === 'parent' && stored.from === from);
    if (parent) {
      throw new OteaError(
        'parent_exists',
        `${from} already has a parent, ${parent.to}; unlink it first (an item has at most one parent)`,
      );
    }
  }
  if (!ACYCLIC.includes(kind)) return;
  const loop = pathBetween(
    existing.filter((stored) => stored.kind === kind),
    to,
    from,
  );
  if (loop) {
    throw new OteaError(
      'relation_cycle',
      `${describeRelation(next)} would close a cycle: ${loop.map(describeRelation).join(', ')}`,
    );
  }
}

// The items no cycle of blocks holds back: peeled off from those nothing blocks, as long as some are
// left. What remains sits in a cycle, or waits on one.
function unblockable(order: readonly string[], blocks: readonly Relation[]): Set<string> {
  const waiting = new Map(order.map((id) => [id, 0]));
  for (const { to } of blocks) waiting.set(to, (waiting.get(to) ?? 0) + 1);
  const free = new Set<string>();
  const pending = order.filter((id) => waiting.get(id) === 0);
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    free.add(id);
    for (const { from, to } of blocks) {
      if (from !== id) continue;
      const left = (waiting.get(to) ?? 0) - 1;
      waiting.set(to, left);
      if (left === 0) pending.push(to);
    }
  }
  return free;
}

// The items in the order their `blocks` allow: each comes right after what blocks it, which is pulled
// up before it. Stable (items keep the order given wherever blocks allow) and safe on cycles (what is
// caught in one, or waits on one, keeps its order at the end). Only links between the given items
// count. This is the order a brief lists its items in.
export function orderByBlocks(ids: readonly string[], relations: readonly Relation[]): string[] {
  const order = [...new Set(ids)];
  const inSet = new Set(order);
  const blocks = relations.filter(
    ({ kind, from, to }) => kind === 'blocks' && inSet.has(from) && inSet.has(to) && from !== to,
  );
  const free = unblockable(order, blocks);
  const rank = new Map(order.map((id, index) => [id, index]));
  const placed: string[] = [];
  const done = new Set<string>();
  const place = (id: string): void => {
    if (done.has(id)) return;
    done.add(id);
    const blockers = blocks
      .filter(({ to }) => to === id)
      .map(({ from }) => from)
      .sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
    for (const blocker of blockers) place(blocker);
    placed.push(id);
  };
  for (const id of order) if (free.has(id)) place(id);
  return [...placed, ...order.filter((id) => !free.has(id))];
}

// How far a parent's children got: all of them, the open ones and the closed ones by how they closed.
export type ChildrenSummary = { total: number; open: number; done: number; discarded: number };

export function childrenSummary(children: readonly { closes?: Closing }[]): ChildrenSummary {
  const summary: ChildrenSummary = { total: children.length, open: 0, done: 0, discarded: 0 };
  for (const { closes } of children) {
    if (closes === undefined) summary.open += 1;
    else summary[closes] += 1;
  }
  return summary;
}

export type ChildState = { id: string; state: string; closes?: Closing };

// A state that declares `requires: children_closed` takes a parent only once none of its children
// is open, whatever the state's turn. Nothing ever moves the parent for them.
export function assertChildrenClosed(
  id: string,
  to: string,
  children: readonly ChildState[],
): void {
  const open = children.filter(({ closes }) => closes === undefined);
  if (open.length === 0) return;
  const listed = open.map((child) => `${child.id} (${child.state})`).join(', ');
  throw new OteaError(
    'children_open',
    `${id} cannot move to "${to}" while ${open.length} of its ${children.length} children are open: ${listed}`,
  );
}
