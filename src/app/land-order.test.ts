import { describe, expect, it } from 'vitest';
import { instantiate, requireTemplate } from '../core/board/templates.ts';
import { updateItemState } from '../store/queries.ts';
import { createItem } from './items.ts';
import { claimItem, releaseItem } from './leases.ts';
import { nextFor } from './next.ts';
import { pinItems, setOrder } from './priority.ts';
import { memoryContext, publishAs } from './testing.ts';

const you = { kind: 'human' as const, name: 'fede' };
const agent = (name: string) => ({ kind: 'agent' as const, name });
let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 19, 9, 0, tick++)).toISOString();

// P1-R3-2: approved items raced into main. Unordered and lower items landed first, and the ones on
// top of the person's order conflicted again and again (CAM-6 took four review rounds). One agent
// lands at a time on a base, and the next to land is the one highest in the person's order.
function landing(base = 'main') {
  const ctx = memoryContext();
  const def = instantiate(requireTemplate('changes'), 'es', {}, undefined, { keep: true });
  const branch = def.parts.branch;
  if (branch?.guard) branch.guard.base = base;
  publishAs(ctx, def, 'bcam', now);
  const approved = (title: string) => {
    const { id } = createItem(
      ctx,
      { collection: def.name, title, fields: { want: 'x', branch: `cambio/${title}` }, actor: you },
      now,
    );
    updateItemState(ctx.db, id, 'land', now());
    return id;
  };
  return { ctx, def, approved };
}

describe('landing in the order the person set', () => {
  it('offers the one highest in the order first, not the oldest', () => {
    const { ctx, def, approved } = landing();
    const older = approved('older');
    const first = approved('first');
    setOrder(ctx, { collection: def.name, ids: [first, older], actor: you }, now);

    expect(nextFor(ctx, 'quill', {}, now).item).toBe(first);
  });

  it('refuses a claim of another while the first in the order waits, saying why', () => {
    const { ctx, def, approved } = landing();
    const second = approved('second');
    const first = approved('first');
    setOrder(ctx, { collection: def.name, ids: [first, second], actor: you }, now);

    expect(() => claimItem(ctx, { id: second, actor: agent('quill') }, now)).toThrow(
      `${second} not claimed: ${first} lands in main first (order 1), then ${second}: one agent lands at a time on main, in the person's order, so no landing conflicts with another under way. Take other work meanwhile: otea next.`,
    );
    expect(claimItem(ctx, { id: first, actor: agent('quill') }, now).lease?.holder).toBe('quill');
  });

  it('lands one at a time: nothing else on the base while an agent lands one', () => {
    const { ctx, def, approved } = landing();
    const first = approved('first');
    const second = approved('second');
    // Claimed before the person set the order: its landing is under way.
    claimItem(ctx, { id: first, actor: agent('claude-b') }, now);
    setOrder(ctx, { collection: def.name, ids: [second, first], actor: you }, now);

    const idle = nextFor(ctx, 'quill', {}, now);
    expect(idle).toMatchObject({ item: null, idle: true });
    expect(idle.text).toContain(
      `${second} waits to land in main: claude-b lands ${first} there now; one agent lands at a time on main, in the person's order.`,
    );
    expect(() => claimItem(ctx, { id: second, actor: agent('quill') }, now)).toThrow(
      `${second} not claimed: claude-b lands ${first} in main now; ${second} lands after it: one agent lands at a time on main, in the person's order, so no landing conflicts with another under way. Take other work meanwhile: otea next.`,
    );

    updateItemState(ctx.db, first, 'done', now());
    expect(nextFor(ctx, 'quill', {}, now).item).toBe(second);
  });

  it('puts what the person put on top before the order, and says so', () => {
    const { ctx, def, approved } = landing();
    const ordered = approved('ordered');
    const top = approved('top');
    setOrder(ctx, { collection: def.name, ids: [ordered], actor: you }, now);
    pinItems(ctx, { ids: [top], pinned: true, actor: you }, now);

    expect(() => claimItem(ctx, { id: ordered, actor: agent('quill') }, now)).toThrow(
      `${top} lands in main first (on top 1)`,
    );
  });

  it('takes the oldest approved first among items with no order', () => {
    const { ctx, approved } = landing();
    const oldest = approved('oldest');
    const newer = approved('newer');

    expect(() => claimItem(ctx, { id: newer, actor: agent('quill') }, now)).toThrow(
      `${oldest} lands in main first (approved before it)`,
    );
  });

  it('lets the agent that took one up go on with it once its lease ran out', () => {
    const { ctx, def, approved } = landing();
    const second = approved('second');
    claimItem(ctx, { id: second, actor: agent('quill') }, () => '2026-11-19T08:00:00.000Z');
    const first = approved('first');
    setOrder(ctx, { collection: def.name, ids: [first, second], actor: you }, now);

    expect(claimItem(ctx, { id: second, actor: agent('quill') }, now).lease?.holder).toBe('quill');
  });

  // What an agent cannot take never holds up its next landing. One set aside for later is the
  // person's wish, so no other agent takes it either (P7-R3-6).
  it('lets an agent land the next past one set aside, which no other agent takes', () => {
    const { ctx, def, approved } = landing();
    const first = approved('first');
    const second = approved('second');
    setOrder(ctx, { collection: def.name, ids: [first, second], actor: you }, now);
    claimItem(ctx, { id: first, actor: agent('claude-b') }, now);
    releaseItem(ctx, { id: first, actor: agent('claude-b'), later: true }, now);

    expect(nextFor(ctx, 'claude-b', {}, now).item).toBe(second);
    expect(nextFor(ctx, 'quill', {}, now).item).not.toBe(first);
  });

  it('keeps each base apart: a landing in main never holds one in another base', () => {
    const main = landing('main');
    const first = main.approved('first');
    claimItem(main.ctx, { id: first, actor: agent('claude-b') }, now);
    const ctx = main.ctx;
    const other = instantiate(requireTemplate('changes'), 'es', { name: 'Docs' }, undefined, {
      keep: true,
    });
    const guard = other.parts.branch?.guard;
    if (guard) guard.base = 'docs';
    publishAs(ctx, other, 'bdoc', now);
    const { id } = createItem(
      ctx,
      {
        collection: 'Docs',
        title: 'docs',
        fields: { want: 'x', branch: 'cambio/docs' },
        actor: you,
      },
      now,
    );
    updateItemState(ctx.db, id, 'land', now());

    expect(nextFor(ctx, 'quill', {}, now).item).toBe(id);
  });
});
