import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import { parsePreset } from '../core/preset.ts';
import { orderByBlocks } from '../core/relations.ts';
import { addCollection } from './collections.ts';
import type { Context } from './context.ts';
import { createItem, getItem, listItems, moveItem, showItem } from './items.ts';
import { claimItem } from './leases.ts';
import { linkItems, listRelations, unlinkItems } from './relations.ts';
import { relayDecision } from './relay.ts';
import { memoryContext } from './testing.ts';

// done requires every child closed first; dropped does not.
const WORK = parsePreset(`
preset: work
preset_version: 1
fields:
  title: { module: text, required: create }
workflow:
  initial: open
  states:
    open: { turn: agent }
    review: { turn: human }
    done: { turn: none, closes: done, close_requires: children_closed }
    dropped: { turn: none, closes: discarded }
  transitions:
    - { from: open, to: review, by: agent }
    - { from: review, to: done, by: human }
    - { from: [open, review], to: dropped, by: agent }
`);

// review is a working state, on the human's turn, that waits for every child; done does too, through
// the deprecated close_requires.
const EPIC = parsePreset(`
preset: epic
preset_version: 1
fields:
  title: { module: text, required: create }
workflow:
  initial: building
  states:
    building: { turn: agent }
    parked: { turn: human }
    review: { turn: human, requires: children_closed }
    done: { turn: none, closes: done, close_requires: children_closed }
  transitions:
    - { from: building, to: review, by: agent }
    - { from: building, to: parked, by: agent }
    - { from: parked, to: review, by: human }
    - { from: review, to: done, by: human }
`);

const ana: Actor = { kind: 'human', name: 'ana' };
const bot: Actor = { kind: 'agent', name: 'claude' };
const other: Actor = { kind: 'agent', name: 'codex' };

function clock(...times: string[]) {
  let index = 0;
  return () => times[Math.min(index++, times.length - 1)] ?? '';
}

describe('relations', () => {
  let ctx: Context;

  const make = (collection: string, title: string, parent?: string) =>
    createItem(ctx, { collection, title, actor: bot, ...(parent ? { parent } : {}) }).id;
  const link = (id: string, kind: string, to: string, actor: Actor = bot) =>
    linkItems(ctx, { id, kind, other: to, actor, channel: 'cli' });
  const codeOf = (run: () => unknown) => {
    try {
      run();
    } catch (error) {
      return (error as { code?: string }).code;
    }
    return undefined;
  };
  const move = (id: string, to: string, actor: Actor = bot) =>
    moveItem(ctx, { id, to, actor, channel: actor.kind === 'human' ? 'ui' : 'cli' });

  beforeEach(() => {
    ctx = memoryContext(WORK);
    addCollection(ctx, { name: 'epics', preset: 'work' });
    addCollection(ctx, { name: 'parts', preset: 'work' });
    make('epics', 'Create wolf');
    make('parts', 'Body');
    make('parts', 'Movement');
    make('parts', 'Animation');
  });

  afterEach(() => ctx.db.close());

  describe('linkItems', () => {
    it('links two items across collections and records who did it', () => {
      const relation = linkItems(
        ctx,
        { id: 'PARTS-1', kind: 'parent', other: 'EPICS-1', actor: bot, channel: 'mcp' },
        clock('t1'),
      );

      expect(relation).toEqual({
        kind: 'parent',
        from: 'PARTS-1',
        to: 'EPICS-1',
        createdAt: 't1',
        actor: bot,
        channel: 'mcp',
      });
      expect(listRelations(ctx)).toEqual([relation]);
    });

    it('appends a relation_added event to both items', () => {
      link('PARTS-1', 'blocks', 'PARTS-2');

      const data = { kind: 'blocks', from: 'PARTS-1', to: 'PARTS-2', channel: 'cli' };
      for (const id of ['PARTS-1', 'PARTS-2']) {
        expect(getItem(ctx, id).events.at(-1)).toMatchObject({
          type: 'relation_added',
          actor: bot,
          data,
        });
      }
    });

    it('stores a symmetric relation once, whichever way it was given', () => {
      link('PARTS-2', 'relates', 'PARTS-1');

      expect(listRelations(ctx)).toMatchObject([
        { kind: 'relates', from: 'PARTS-1', to: 'PARTS-2' },
      ]);
      expect(codeOf(() => link('PARTS-1', 'relates', 'PARTS-2'))).toBe('already_exists');
    });

    it.each([
      ['an item related to itself', ['PARTS-1', 'blocks', 'PARTS-1'], 'self_relation'],
      ['a missing item', ['PARTS-1', 'blocks', 'PARTS-9'], 'not_found'],
      ['a missing subject', ['PARTS-9', 'blocks', 'PARTS-1'], 'not_found'],
      ['an unknown kind', ['PARTS-1', 'child', 'EPICS-1'], 'invalid_relation'],
    ])('refuses %s without writing anything', (_, [id = '', kind = '', to = ''], code) => {
      expect(codeOf(() => link(id, kind, to))).toBe(code);
      expect(listRelations(ctx)).toEqual([]);
      expect(getItem(ctx, 'PARTS-1').events).toHaveLength(1);
    });

    it('refuses a second parent and a cycle', () => {
      link('PARTS-1', 'parent', 'EPICS-1');
      link('PARTS-2', 'blocks', 'PARTS-3');

      expect(codeOf(() => link('PARTS-1', 'parent', 'PARTS-2'))).toBe('parent_exists');
      expect(codeOf(() => link('EPICS-1', 'parent', 'PARTS-1'))).toBe('relation_cycle');
      expect(codeOf(() => link('PARTS-3', 'blocks', 'PARTS-2'))).toBe('relation_cycle');
    });

    it('lets humans link too', () => {
      expect(link('PARTS-1', 'relates', 'PARTS-2', ana).actor).toEqual(ana);
    });

    it('is not bound by leases, and links closed items', () => {
      claimItem(ctx, { id: 'PARTS-1', actor: other });
      move('PARTS-3', 'dropped');

      expect(() => link('PARTS-1', 'blocks', 'PARTS-2')).not.toThrow();
      expect(() => link('PARTS-3', 'duplicates', 'PARTS-2')).not.toThrow();
    });

    it('gives a closed parent no open child, but takes a closed one', () => {
      move('PARTS-3', 'dropped');
      move('EPICS-1', 'dropped');

      expect(codeOf(() => link('PARTS-1', 'parent', 'EPICS-1'))).toBe('item_closed');
      expect(() => link('PARTS-3', 'parent', 'EPICS-1')).not.toThrow();
    });
  });

  describe('unlinkItems', () => {
    it('removes the link and appends relation_removed to both items', () => {
      link('PARTS-1', 'parent', 'EPICS-1');

      const removed = unlinkItems(ctx, {
        id: 'PARTS-1',
        kind: 'parent',
        other: 'EPICS-1',
        actor: ana,
        channel: 'ui',
      });

      expect(removed).toEqual({ kind: 'parent', from: 'PARTS-1', to: 'EPICS-1' });
      expect(listRelations(ctx)).toEqual([]);
      for (const id of ['PARTS-1', 'EPICS-1']) {
        expect(getItem(ctx, id).events.at(-1)).toMatchObject({
          type: 'relation_removed',
          actor: ana,
          data: { kind: 'parent', from: 'PARTS-1', to: 'EPICS-1', channel: 'ui' },
        });
      }
      expect(() => link('PARTS-1', 'parent', 'PARTS-2')).not.toThrow();
    });

    it('removes a symmetric link named either way', () => {
      link('PARTS-1', 'relates', 'PARTS-2');

      unlinkItems(ctx, {
        id: 'PARTS-2',
        kind: 'relates',
        other: 'PARTS-1',
        actor: bot,
        channel: 'cli',
      });

      expect(listRelations(ctx)).toEqual([]);
    });

    it('fails with not_found for a link that does not exist, including the other way', () => {
      link('PARTS-1', 'blocks', 'PARTS-2');

      const unlink = () =>
        unlinkItems(ctx, {
          id: 'PARTS-2',
          kind: 'blocks',
          other: 'PARTS-1',
          actor: bot,
          channel: 'cli',
        });

      expect(codeOf(unlink)).toBe('not_found');
      expect(listRelations(ctx)).toHaveLength(1);
    });
  });

  describe('createItem with a parent', () => {
    it('creates the item under its parent in the same write', () => {
      const item = createItem(ctx, {
        collection: 'parts',
        title: 'Fur',
        parent: 'EPICS-1',
        actor: bot,
      });

      expect(item.relations).toEqual([{ kind: 'parent', id: 'EPICS-1' }]);
      expect(listRelations(ctx)).toMatchObject([
        { kind: 'parent', from: 'PARTS-4', to: 'EPICS-1' },
      ]);
      expect(getItem(ctx, 'PARTS-4').events.map(({ type }) => type)).toEqual([
        'created',
        'relation_added',
      ]);
    });

    it('creates nothing when the parent does not exist', () => {
      const create = () =>
        createItem(ctx, { collection: 'parts', title: 'Fur', parent: 'EPICS-9', actor: bot });

      expect(codeOf(create)).toBe('not_found');
      expect(listItems(ctx, { collection: 'parts' })).toHaveLength(3);
    });
  });

  describe('reading', () => {
    beforeEach(() => {
      for (const id of ['PARTS-1', 'PARTS-2', 'PARTS-3']) link(id, 'parent', 'EPICS-1');
      link('PARTS-1', 'blocks', 'PARTS-2');
      move('PARTS-3', 'dropped');
    });

    it('shows each relation from the item, with the other item where it stands', () => {
      const shown = showItem(ctx, 'PARTS-2', { actor: bot, channel: 'cli' });

      expect(shown.relations).toEqual([
        {
          kind: 'parent',
          id: 'EPICS-1',
          collection: 'epics',
          type: 'item',
          title: 'Create wolf',
          state: 'open',
          turn: 'agent',
          lease: null,
        },
        {
          kind: 'blocked_by',
          id: 'PARTS-1',
          collection: 'parts',
          type: 'item',
          title: 'Body',
          state: 'open',
          turn: 'agent',
          lease: null,
        },
      ]);
      expect(shown.children).toBeUndefined();
    });

    it('shows a parent its children and how far they got', () => {
      const shown = showItem(ctx, 'EPICS-1', { actor: bot, channel: 'cli' });

      expect(shown.relations.map(({ kind, id }) => `${kind} ${id}`)).toEqual([
        'child PARTS-1',
        'child PARTS-2',
        'child PARTS-3',
      ]);
      expect(shown.relations[2]).toMatchObject({ state: 'dropped', closes: 'discarded' });
      expect(shown.children).toEqual({ total: 3, open: 2, done: 0, discarded: 1 });
    });

    it('lists the relations and the children summary only of items that have them', () => {
      const items = listItems(ctx);

      expect(items.find(({ id }) => id === 'EPICS-1')).toMatchObject({
        children: { total: 3, open: 2, done: 0, discarded: 1 },
      });
      expect(items.find(({ id }) => id === 'PARTS-1')?.relations).toEqual([
        { kind: 'parent', id: 'EPICS-1' },
        { kind: 'blocks', id: 'PARTS-2' },
      ]);
      make('parts', 'Loose');
      const loose = listItems(ctx).find(({ id }) => id === 'PARTS-4');
      expect(loose).not.toHaveProperty('relations');
      expect(loose).not.toHaveProperty('children');
    });

    it('filters the list by parent', () => {
      expect(listItems(ctx, { parent: 'EPICS-1' }).map(({ id }) => id)).toEqual([
        'PARTS-1',
        'PARTS-2',
        'PARTS-3',
      ]);
      expect(listItems(ctx, { parent: 'PARTS-1' })).toEqual([]);
      expect(codeOf(() => listItems(ctx, { parent: 'EPICS-9' }))).toBe('not_found');
    });

    it('orders the blocked after their blockers from the stored relations', () => {
      const ids = ['PARTS-2', 'PARTS-1', 'PARTS-3'];

      expect(orderByBlocks(ids, listRelations(ctx))).toEqual(['PARTS-1', 'PARTS-2', 'PARTS-3']);
    });
  });

  describe('closing a parent', () => {
    beforeEach(() => {
      link('PARTS-1', 'parent', 'EPICS-1');
      link('PARTS-2', 'parent', 'EPICS-1');
      move('EPICS-1', 'review');
    });

    it('is refused while a child is open, naming the open children', () => {
      move('PARTS-1', 'dropped');

      const close = () => move('EPICS-1', 'done', ana);

      expect(codeOf(close)).toBe('children_open');
      expect(close).toThrow('PARTS-2 (open)');
      expect(getItem(ctx, 'EPICS-1').state).toBe('review');
    });

    it('is refused for a relayed decision too', () => {
      const relay = () =>
        relayDecision(ctx, {
          id: 'EPICS-1',
          to: 'done',
          via: 'claude',
          channel: 'cli',
          quote: 'Ship the wolf',
        });

      expect(codeOf(relay)).toBe('children_open');
    });

    it('goes through once every child is closed, and never on its own', () => {
      move('PARTS-1', 'dropped');
      move('PARTS-2', 'review');
      move('PARTS-2', 'done', ana);

      expect(getItem(ctx, 'EPICS-1').state).toBe('review');
      expect(move('EPICS-1', 'done', ana).state).toBe('done');
    });

    it('does not apply to a closed state without the rule', () => {
      expect(move('EPICS-1', 'dropped').state).toBe('dropped');
    });
  });

  describe('entering a working state that requires closed children', () => {
    let epics: Context;

    beforeEach(() => {
      epics = memoryContext(EPIC);
      addCollection(epics, { name: 'epics', preset: 'epic' });
      for (const title of ['Create wolf', 'Body', 'Movement']) {
        createItem(epics, { collection: 'epics', title, actor: bot });
      }
      linkItems(epics, {
        id: 'EPICS-2',
        kind: 'parent',
        other: 'EPICS-1',
        actor: bot,
        channel: 'cli',
      });
      linkItems(epics, {
        id: 'EPICS-3',
        kind: 'parent',
        other: 'EPICS-1',
        actor: bot,
        channel: 'cli',
      });
    });

    afterEach(() => epics.db.close());

    const enter = (id: string, to: string, actor: Actor = bot) =>
      moveItem(epics, { id, to, actor, channel: actor.kind === 'human' ? 'ui' : 'cli' });

    it('refuses an agent move, naming each open child with its state', () => {
      enter('EPICS-2', 'parked');

      const back = () => enter('EPICS-1', 'review');

      expect(codeOf(back)).toBe('children_open');
      expect(back).toThrow('EPICS-2 (parked), EPICS-3 (building)');
      expect(getItem(epics, 'EPICS-1').state).toBe('building');
    });

    it('refuses a move in the UI and a relayed decision alike', () => {
      enter('EPICS-1', 'parked');

      expect(codeOf(() => enter('EPICS-1', 'review', ana))).toBe('children_open');
      const relay = () =>
        relayDecision(epics, {
          id: 'EPICS-1',
          to: 'review',
          via: 'claude',
          channel: 'cli',
          quote: 'Send it back to me',
        });
      expect(codeOf(relay)).toBe('children_open');
      expect(getItem(epics, 'EPICS-1').state).toBe('parked');
    });

    it('lets the parent in once every child is closed, and never moves it on its own', () => {
      for (const child of ['EPICS-2', 'EPICS-3']) enter(child, 'review');
      expect(getItem(epics, 'EPICS-1').state).toBe('building');

      for (const child of ['EPICS-2', 'EPICS-3']) enter(child, 'done', ana);

      expect(getItem(epics, 'EPICS-1').state).toBe('building');
      expect(enter('EPICS-1', 'review').state).toBe('review');
    });

    it('says on the move what entering waits for', () => {
      const moves = showItem(epics, 'EPICS-1', { actor: bot, channel: 'cli' }).transitions;

      expect(moves.find(({ to }) => to === 'review')).toMatchObject({
        requires: 'children_closed',
      });
      expect(moves.find(({ to }) => to === 'parked')).not.toHaveProperty('requires');
    });
  });
});
