import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import { parsePreset } from '../core/preset.ts';
import { orderByBlocks } from '../core/relations.ts';
import { insertRelation } from '../store/queries.ts';
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

// review waits for every child and for everything that blocks the item, in any collection.
const WEB = parsePreset(`
preset: web
preset_version: 1
fields:
  title: { module: text, required: create }
workflow:
  initial: building
  states:
    building: { turn: agent }
    parked: { turn: human }
    review: { turn: human, requires: [children_closed, blockers_closed] }
    done: { turn: none, closes: done }
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
    addCollection(ctx, { name: 'work', preset: 'work' });
    addCollection(ctx, { name: 'bugs', preset: 'work' });
    make('work', 'Create wolf');
    make('work', 'Body');
    make('work', 'Movement');
    make('work', 'Animation');
    make('bugs', 'Wolf clips through trees');
  });

  afterEach(() => ctx.db.close());

  describe('linkItems', () => {
    it('links two items and records who did it', () => {
      const relation = linkItems(
        ctx,
        { id: 'WORK-2', kind: 'parent', other: 'WORK-1', actor: bot, channel: 'mcp' },
        clock('t1'),
      );

      expect(relation).toEqual({
        kind: 'parent',
        from: 'WORK-2',
        to: 'WORK-1',
        createdAt: 't1',
        actor: bot,
        channel: 'mcp',
      });
      expect(listRelations(ctx)).toEqual([relation]);
    });

    it('appends a relation_added event to both items', () => {
      link('WORK-2', 'blocks', 'WORK-3');

      const data = { kind: 'blocks', from: 'WORK-2', to: 'WORK-3', channel: 'cli' };
      for (const id of ['WORK-2', 'WORK-3']) {
        expect(getItem(ctx, id).events.at(-1)).toMatchObject({
          type: 'relation_added',
          actor: bot,
          data,
        });
      }
    });

    it('stores a symmetric relation once, whichever way it was given', () => {
      link('WORK-3', 'relates', 'WORK-2');

      expect(listRelations(ctx)).toMatchObject([{ kind: 'relates', from: 'WORK-2', to: 'WORK-3' }]);
      expect(codeOf(() => link('WORK-2', 'relates', 'WORK-3'))).toBe('already_exists');
    });

    it.each([
      ['an item related to itself', ['WORK-2', 'blocks', 'WORK-2'], 'self_relation'],
      ['a missing item', ['WORK-2', 'blocks', 'WORK-10'], 'not_found'],
      ['a missing subject', ['WORK-10', 'blocks', 'WORK-2'], 'not_found'],
      ['an unknown kind', ['WORK-2', 'child', 'WORK-1'], 'invalid_relation'],
    ])('refuses %s without writing anything', (_, [id = '', kind = '', to = ''], code) => {
      expect(codeOf(() => link(id, kind, to))).toBe(code);
      expect(listRelations(ctx)).toEqual([]);
      expect(getItem(ctx, 'WORK-2').events).toHaveLength(1);
    });

    it('refuses a second parent and a cycle', () => {
      link('WORK-2', 'parent', 'WORK-1');
      link('WORK-3', 'blocks', 'WORK-4');

      expect(codeOf(() => link('WORK-2', 'parent', 'WORK-3'))).toBe('parent_exists');
      expect(codeOf(() => link('WORK-1', 'parent', 'WORK-2'))).toBe('relation_cycle');
      expect(codeOf(() => link('WORK-4', 'blocks', 'WORK-3'))).toBe('relation_cycle');
    });

    it('lets humans link too', () => {
      expect(link('WORK-2', 'relates', 'WORK-3', ana).actor).toEqual(ana);
    });

    it('is not bound by leases, and links closed items', () => {
      claimItem(ctx, { id: 'WORK-2', actor: other });
      move('WORK-4', 'dropped');

      expect(() => link('WORK-2', 'blocks', 'WORK-3')).not.toThrow();
      expect(() => link('WORK-4', 'duplicates', 'WORK-3')).not.toThrow();
    });

    it('gives a closed parent no open child, but takes a closed one', () => {
      move('WORK-4', 'dropped');
      move('WORK-1', 'dropped');

      expect(codeOf(() => link('WORK-2', 'parent', 'WORK-1'))).toBe('item_closed');
      expect(() => link('WORK-4', 'parent', 'WORK-1')).not.toThrow();
    });
  });

  describe('a parent in another collection', () => {
    it('is refused, pointing to blocks and implements, without writing anything', () => {
      const across = () => link('WORK-2', 'parent', 'BUGS-1');

      expect(codeOf(across)).toBe('parent_across_boards');
      expect(across).toThrow(
        'WORK-2 (work) cannot be a child of BUGS-1 (bugs): a parent lives in the same collection; link WORK-2 blocks BUGS-1 to make BUGS-1 wait, or WORK-2 implements BUGS-1',
      );
      expect(listRelations(ctx)).toEqual([]);
    });

    it('is refused on create too, creating nothing', () => {
      const create = () =>
        createItem(ctx, { collection: 'bugs', title: 'Fur', parent: 'WORK-1', actor: bot });

      expect(codeOf(create)).toBe('parent_across_boards');
      expect(listItems(ctx, { collection: 'bugs' })).toHaveLength(1);
    });

    it('leaves the other kinds free across collections', () => {
      expect(() => link('BUGS-1', 'blocks', 'WORK-2')).not.toThrow();
      expect(() => link('WORK-3', 'implements', 'BUGS-1')).not.toThrow();
    });

    it('keeps reading a link stored before the rule', () => {
      const old = { kind: 'parent' as const, from: 'BUGS-1', to: 'WORK-1' };
      insertRelation(ctx.db, { ...old, createdAt: 't0', actor: bot, channel: 'cli' });

      expect(showItem(ctx, 'WORK-1', { actor: bot, channel: 'cli' })).toMatchObject({
        relations: [{ kind: 'child', id: 'BUGS-1', collection: 'bugs' }],
        children: { total: 1, open: 1 },
      });
      expect(listItems(ctx, { parent: 'WORK-1' }).map(({ id }) => id)).toEqual(['BUGS-1']);
    });
  });

  describe('unlinkItems', () => {
    it('removes the link and appends relation_removed to both items', () => {
      link('WORK-2', 'parent', 'WORK-1');

      const removed = unlinkItems(ctx, {
        id: 'WORK-2',
        kind: 'parent',
        other: 'WORK-1',
        actor: ana,
        channel: 'ui',
      });

      expect(removed).toEqual({ kind: 'parent', from: 'WORK-2', to: 'WORK-1' });
      expect(listRelations(ctx)).toEqual([]);
      for (const id of ['WORK-2', 'WORK-1']) {
        expect(getItem(ctx, id).events.at(-1)).toMatchObject({
          type: 'relation_removed',
          actor: ana,
          data: { kind: 'parent', from: 'WORK-2', to: 'WORK-1', channel: 'ui' },
        });
      }
      expect(() => link('WORK-2', 'parent', 'WORK-3')).not.toThrow();
    });

    it('removes a symmetric link named either way', () => {
      link('WORK-2', 'relates', 'WORK-3');

      unlinkItems(ctx, {
        id: 'WORK-3',
        kind: 'relates',
        other: 'WORK-2',
        actor: bot,
        channel: 'cli',
      });

      expect(listRelations(ctx)).toEqual([]);
    });

    it('fails with not_found for a link that does not exist, including the other way', () => {
      link('WORK-2', 'blocks', 'WORK-3');

      const unlink = () =>
        unlinkItems(ctx, {
          id: 'WORK-3',
          kind: 'blocks',
          other: 'WORK-2',
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
        collection: 'work',
        title: 'Fur',
        parent: 'WORK-1',
        actor: bot,
      });

      expect(item.relations).toEqual([{ kind: 'parent', id: 'WORK-1' }]);
      expect(listRelations(ctx)).toMatchObject([{ kind: 'parent', from: 'WORK-5', to: 'WORK-1' }]);
      expect(getItem(ctx, 'WORK-5').events.map(({ type }) => type)).toEqual([
        'created',
        'relation_added',
      ]);
    });

    it('creates nothing when the parent does not exist', () => {
      const create = () =>
        createItem(ctx, { collection: 'work', title: 'Fur', parent: 'WORK-99', actor: bot });

      expect(codeOf(create)).toBe('not_found');
      expect(listItems(ctx, { collection: 'work' })).toHaveLength(4);
    });
  });

  describe('reading', () => {
    beforeEach(() => {
      for (const id of ['WORK-2', 'WORK-3', 'WORK-4']) link(id, 'parent', 'WORK-1');
      link('WORK-2', 'blocks', 'WORK-3');
      move('WORK-4', 'dropped');
    });

    it('shows each relation from the item, with the other item where it stands', () => {
      const shown = showItem(ctx, 'WORK-3', { actor: bot, channel: 'cli' });

      expect(shown.relations).toEqual([
        {
          kind: 'parent',
          id: 'WORK-1',
          collection: 'work',
          type: 'item',
          title: 'Create wolf',
          state: 'open',
          turn: 'agent',
          lease: null,
        },
        {
          kind: 'blocked_by',
          id: 'WORK-2',
          collection: 'work',
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
      const shown = showItem(ctx, 'WORK-1', { actor: bot, channel: 'cli' });

      expect(shown.relations.map(({ kind, id }) => `${kind} ${id}`)).toEqual([
        'child WORK-2',
        'child WORK-3',
        'child WORK-4',
      ]);
      expect(shown.relations[2]).toMatchObject({ state: 'dropped', closes: 'discarded' });
      expect(shown.children).toEqual({ total: 3, open: 2, done: 0, discarded: 1 });
    });

    it('lists the relations and the children summary only of items that have them', () => {
      const items = listItems(ctx);

      expect(items.find(({ id }) => id === 'WORK-1')).toMatchObject({
        children: { total: 3, open: 2, done: 0, discarded: 1 },
      });
      expect(items.find(({ id }) => id === 'WORK-2')?.relations).toEqual([
        { kind: 'parent', id: 'WORK-1' },
        { kind: 'blocks', id: 'WORK-3' },
      ]);
      make('work', 'Loose');
      const loose = listItems(ctx).find(({ id }) => id === 'WORK-5');
      expect(loose).not.toHaveProperty('relations');
      expect(loose).not.toHaveProperty('children');
    });

    it('filters the list by parent', () => {
      expect(listItems(ctx, { parent: 'WORK-1' }).map(({ id }) => id)).toEqual([
        'WORK-2',
        'WORK-3',
        'WORK-4',
      ]);
      expect(listItems(ctx, { parent: 'WORK-2' })).toEqual([]);
      expect(codeOf(() => listItems(ctx, { parent: 'WORK-99' }))).toBe('not_found');
    });

    it('orders the blocked after their blockers from the stored relations', () => {
      const ids = ['WORK-3', 'WORK-2', 'WORK-4'];

      expect(orderByBlocks(ids, listRelations(ctx))).toEqual(['WORK-2', 'WORK-3', 'WORK-4']);
    });
  });

  describe('closing a parent', () => {
    beforeEach(() => {
      link('WORK-2', 'parent', 'WORK-1');
      link('WORK-3', 'parent', 'WORK-1');
      move('WORK-1', 'review');
    });

    it('is refused while a child is open, naming the open children', () => {
      move('WORK-2', 'dropped');

      const close = () => move('WORK-1', 'done', ana);

      expect(codeOf(close)).toBe('children_open');
      expect(close).toThrow('WORK-3 (open)');
      expect(getItem(ctx, 'WORK-1').state).toBe('review');
    });

    it('is refused for a relayed decision too', () => {
      const relay = () =>
        relayDecision(ctx, {
          id: 'WORK-1',
          to: 'done',
          via: 'claude',
          channel: 'cli',
          quote: 'Ship the wolf',
        });

      expect(codeOf(relay)).toBe('children_open');
    });

    it('goes through once every child is closed, and never on its own', () => {
      move('WORK-2', 'dropped');
      move('WORK-3', 'review');
      move('WORK-3', 'done', ana);

      expect(getItem(ctx, 'WORK-1').state).toBe('review');
      expect(move('WORK-1', 'done', ana).state).toBe('done');
    });

    it('does not apply to a closed state without the rule', () => {
      expect(move('WORK-1', 'dropped').state).toBe('dropped');
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
        requires: ['children_closed'],
      });
      expect(moves.find(({ to }) => to === 'parked')).not.toHaveProperty('requires');
    });
  });

  describe('entering a state that requires closed blockers', () => {
    let web: Context;

    beforeEach(() => {
      web = memoryContext(WORK, WEB);
      addCollection(web, { name: 'web', preset: 'web' });
      addCollection(web, { name: 'api', preset: 'work' });
      for (const title of ['Login page', 'Form']) {
        createItem(web, { collection: 'web', title, actor: bot });
      }
      for (const title of ['Auth endpoint', 'Session store', 'Rate limits']) {
        createItem(web, { collection: 'api', title, actor: bot });
      }
      for (const blocker of ['API-1', 'API-2']) {
        linkItems(web, { id: blocker, kind: 'blocks', other: 'WEB-1', actor: bot, channel: 'cli' });
      }
    });

    afterEach(() => web.db.close());

    const enter = (id: string, to: string, actor: Actor = bot) =>
      moveItem(web, { id, to, actor, channel: actor.kind === 'human' ? 'ui' : 'cli' });

    it('refuses a move while a blocker in another collection is open, naming each', () => {
      enter('API-1', 'dropped');

      const send = () => enter('WEB-1', 'review');

      expect(codeOf(send)).toBe('blockers_open');
      expect(send).toThrow(
        'WEB-1 cannot move to "review" while 1 of its 2 blockers is open: API-2 (open)',
      );
      expect(getItem(web, 'WEB-1').state).toBe('building');
    });

    it('refuses a relayed decision alike', () => {
      enter('WEB-1', 'parked');

      const relay = () =>
        relayDecision(web, {
          id: 'WEB-1',
          to: 'review',
          via: 'claude',
          channel: 'cli',
          quote: 'Show me the login',
        });

      expect(codeOf(relay)).toBe('blockers_open');
    });

    it('lets the item in once every blocker is closed, and never moves it on its own', () => {
      for (const blocker of ['API-1', 'API-2']) enter(blocker, 'dropped');

      expect(getItem(web, 'WEB-1').state).toBe('building');
      expect(enter('WEB-1', 'review').state).toBe('review');
    });

    it('waits for the children as well, when the state requires both', () => {
      for (const blocker of ['API-1', 'API-2']) enter(blocker, 'dropped');
      linkItems(web, { id: 'WEB-2', kind: 'parent', other: 'WEB-1', actor: bot, channel: 'cli' });

      expect(codeOf(() => enter('WEB-1', 'review'))).toBe('children_open');
    });

    it('counts a closed blocker as done, and never what the item blocks', () => {
      for (const blocker of ['API-1', 'API-2']) enter(blocker, 'dropped');
      linkItems(web, { id: 'WEB-2', kind: 'blocks', other: 'WEB-1', actor: bot, channel: 'cli' });
      enter('WEB-2', 'review');
      enter('WEB-2', 'done', ana);
      linkItems(web, { id: 'WEB-1', kind: 'blocks', other: 'API-3', actor: bot, channel: 'cli' });

      expect(enter('WEB-1', 'review').state).toBe('review');
    });

    it('says on the move what entering waits for', () => {
      const moves = showItem(web, 'WEB-1', { actor: bot, channel: 'cli' }).transitions;

      expect(moves.find(({ to }) => to === 'review')).toMatchObject({
        requires: ['children_closed', 'blockers_closed'],
      });
    });
  });
});
