import { describe, expect, it } from 'vitest';
import { sequenceIds } from '../core/board/ids.ts';
import type { BoardDefinition } from '../core/board/model.ts';
import { creatures } from '../core/board/testing.ts';
import { OteaError } from '../core/errors.ts';
import { insertEvidence, selectEvents } from '../store/queries.ts';
import { createBoard, publishBoard, saveDraft } from './boards.ts';
import type { Context } from './context.ts';
import { createItem } from './items.ts';
import { claimItem, releaseItem } from './leases.ts';
import { approveItem, handoffItem, nextFor, offerableTo } from './next.ts';
import { leaveNote } from './notes.ts';
import { pinItems, setOrder } from './priority.ts';
import { askQuestion } from './questions.ts';
import { linkItems } from './relations.ts';
import { resumeItem } from './restart.ts';
import { SET_ASIDE_LIFTED, setAsideOf } from './set-aside.ts';
import { memoryContext } from './testing.ts';

// P7-R3-1: an agent set items aside with otea release --later while their parts were still open,
// and nothing ever lifted it: once the parts closed, next and wait kept hiding the person's first
// item from the only agent. --later is refused on what is not agent work right now, and a
// set-aside lifts once the item is agent work again after waiting, or once the person acts on it.

const you = { kind: 'human' as const, name: 'fede' };
const kiln = { kind: 'agent' as const, name: 'kiln' };
const quill = { kind: 'agent' as const, name: 'quill' };

let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 19, 9, 0, tick++)).toISOString();

// Criaturas whose Animar waits for the item's parts and what blocks it.
function waitingBoard(ctx: Context): BoardDefinition {
  const def = creatures();
  def.steps = def.steps.map((s) =>
    s.id === 'sanimate' ? { ...s, waits: ['parts' as const, 'blockers' as const] } : s,
  );
  // Its creatures divide into smaller ones on the same board.
  def.split = { board: 'same', always: false };
  const record = createBoard(ctx, { name: def.name, lang: 'es' }, now, sequenceIds());
  saveDraft(ctx, record.id, { definition: def, baseVersion: null }, now);
  publishBoard(ctx, record.id, { moves: {}, by: you }, now);
  return def;
}

function creature(ctx: Context, title: string) {
  return createItem(
    ctx,
    { collection: 'Criaturas', title, fields: { fdesc: 'Lenta' }, actor: you, channel: 'ui' },
    now,
  );
}

function attachArt(ctx: Context, id: string) {
  insertEvidence(ctx.db, {
    itemId: id,
    role: 'after',
    module: 'eart',
    kind: 'image',
    filename: 'a.png',
    contentType: 'image/png',
    size: 1,
    sha256: 'a'.repeat(64),
    caption: null,
    createdAt: now(),
    actor: quill,
    channel: 'cli',
  });
}

// An item standing in Animar's doing, the agents' work.
function animating(ctx: Context, title = 'Avanzada') {
  const item = creature(ctx, title);
  attachArt(ctx, item.id);
  handoffItem(ctx, { id: item.id, actor: quill, channel: 'cli' }, now);
  approveItem(ctx, { id: item.id, actor: you, channel: 'ui' }, now);
  return item;
}

function setAside(ctx: Context, id: string, agent = kiln) {
  claimItem(ctx, { id, actor: agent }, now);
  releaseItem(ctx, { id, actor: agent, later: true }, now);
}

const lifts = (ctx: Context, id: string) =>
  selectEvents(ctx.db, id)
    .filter(({ type }) => type === SET_ASIDE_LIFTED)
    .map(({ actor, data }) => ({ actor: actor.name, ...data }));

function refusal(run: () => unknown): OteaError {
  try {
    run();
  } catch (error) {
    if (error instanceof OteaError) return error;
    throw error;
  }
  throw new Error('not refused');
}

describe('setting an item aside for later', () => {
  it('is refused on an item that waits for its parts, naming them', () => {
    const ctx = memoryContext();
    waitingBoard(ctx);
    const parent = animating(ctx);
    const part = creature(ctx, 'Parte');
    linkItems(
      ctx,
      { id: part.id, kind: 'parent', other: parent.id, actor: you, channel: 'ui' },
      now,
    );

    const refused = refusal(() =>
      releaseItem(ctx, { id: parent.id, actor: kiln, later: true }, now),
    );

    expect(refused.code).toBe('children_open');
    expect(refused.message).toBe(
      `${parent.id} waits for its parts (${part.id}): otea next offers it again once they close; nothing to set aside.`,
    );
  });

  it('is refused on an item that waits for what blocks it, saying what next does instead', () => {
    const ctx = memoryContext();
    waitingBoard(ctx);
    const along = animating(ctx);
    const blocker = creature(ctx, 'Antes');
    linkItems(
      ctx,
      { id: blocker.id, kind: 'blocks', other: along.id, actor: you, channel: 'ui' },
      now,
    );

    const refused = refusal(() =>
      releaseItem(ctx, { id: along.id, actor: kiln, later: true }, now),
    );

    expect(refused.code).toBe('blockers_open');
    expect(refused.message).toBe(
      `${along.id} waits for what blocks it (${blocker.id}): otea next offers it again once they close; nothing to set aside.`,
    );
    expect(setAsideOf(selectEvents(ctx.db, along.id))).toBeUndefined();
  });

  it('is refused on an item on the person’s turn', () => {
    const ctx = memoryContext();
    waitingBoard(ctx);
    const item = creature(ctx, 'Tortuga');
    attachArt(ctx, item.id);
    handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, now);

    const refused = refusal(() => releaseItem(ctx, { id: item.id, actor: kiln, later: true }, now));

    expect(refused.code).toBe('not_claimable');
    expect(refused.message).toBe(
      `${item.id} is in the review of Concepto, on the person’s turn: otea next offers it again once it is back on an agent’s; nothing to set aside.`,
    );
  });
});

describe('setting aside an item whose question waits', () => {
  it('is refused: the person’s answer brings it back', () => {
    const ctx = memoryContext();
    waitingBoard(ctx);
    const along = animating(ctx);
    claimItem(ctx, { id: along.id, actor: kiln }, now);
    askQuestion(ctx, { id: along.id, text: '¿Con musgo?', actor: kiln, channel: 'cli' }, now);

    const refused = refusal(() =>
      releaseItem(ctx, { id: along.id, actor: kiln, later: true }, now),
    );

    expect(refused.code).toBe('not_claimable');
    expect(refused.message).toBe(
      `${along.id} waits for the person’s answer to kiln’s question: otea next offers it again once they answer; nothing to set aside. To let go of it: otea release ${along.id}`,
    );
  });
});

describe('a set-aside lifting on its own', () => {
  it('lifts once the item’s last open part closes', () => {
    const ctx = memoryContext();
    waitingBoard(ctx);
    const parent = animating(ctx);
    setAside(ctx, parent.id);
    const first = creature(ctx, 'Primera parte');
    const second = creature(ctx, 'Segunda parte');
    for (const part of [first, second])
      linkItems(
        ctx,
        { id: part.id, kind: 'parent', other: parent.id, actor: you, channel: 'ui' },
        now,
      );
    const close = (id: string) => {
      attachArt(ctx, id);
      handoffItem(ctx, { id, actor: quill, channel: 'cli' }, now);
      approveItem(ctx, { id, actor: you, channel: 'ui', way: 'Done' }, now);
    };

    close(first.id);
    expect(lifts(ctx, parent.id)).toEqual([]);
    close(second.id);

    expect(lifts(ctx, parent.id)).toEqual([
      { actor: 'fede', by: 'kiln', cause: 'parts', after: second.id },
    ]);
    expect(nextFor(ctx, 'kiln', {}, now).item).toBe(parent.id);
  });

  it('lifts once what blocked the item closes, and next offers it again', () => {
    const ctx = memoryContext();
    waitingBoard(ctx);
    const along = animating(ctx);
    setAside(ctx, along.id);
    const blocker = creature(ctx, 'Antes');
    linkItems(
      ctx,
      { id: blocker.id, kind: 'blocks', other: along.id, actor: you, channel: 'ui' },
      now,
    );
    expect(offerableTo(ctx, 'kiln', now)(along)).toBe(false);

    attachArt(ctx, blocker.id);
    handoffItem(ctx, { id: blocker.id, actor: quill, channel: 'cli' }, now);
    approveItem(ctx, { id: blocker.id, actor: you, channel: 'ui', way: 'Done' }, now);

    expect(lifts(ctx, along.id)).toEqual([
      { actor: 'fede', by: 'kiln', cause: 'blockers', after: blocker.id },
    ]);
    expect(setAsideOf(selectEvents(ctx.db, along.id))).toBeUndefined();
    expect(nextFor(ctx, 'kiln', {}, now).item).toBe(along.id);
  });

  it('stays while what closes is not what the item waited for', () => {
    const ctx = memoryContext();
    waitingBoard(ctx);
    const along = animating(ctx);
    setAside(ctx, along.id);
    const other = creature(ctx, 'Otra');
    attachArt(ctx, other.id);
    handoffItem(ctx, { id: other.id, actor: quill, channel: 'cli' }, now);
    approveItem(ctx, { id: other.id, actor: you, channel: 'ui', way: 'Done' }, now);

    expect(lifts(ctx, along.id)).toEqual([]);
    expect(setAsideOf(selectEvents(ctx.db, along.id))?.by).toBe('kiln');
  });
});

describe('a set-aside lifting when the person acts on the item', () => {
  it('lifts on their note, so a waiting agent is offered it again', () => {
    const ctx = memoryContext();
    waitingBoard(ctx);
    const along = animating(ctx);
    setAside(ctx, along.id);
    expect(offerableTo(ctx, 'kiln', now)(along)).toBe(false);

    leaveNote(ctx, { id: along.id, text: 'Ya toca', actor: you, channel: 'ui' }, now);

    expect(lifts(ctx, along.id)).toEqual([{ actor: 'fede', by: 'kiln', cause: 'note', note: 1 }]);
    expect(offerableTo(ctx, 'kiln', now)(along)).toBe(true);
  });

  it('lifts when they put it on top or pick it in the order, never when they take it down', () => {
    const ctx = memoryContext();
    waitingBoard(ctx);
    const pinned = animating(ctx, 'Arriba');
    const ordered = animating(ctx, 'Ordenada');
    const down = animating(ctx, 'Abajo');
    setAside(ctx, pinned.id);
    setAside(ctx, ordered.id);
    setAside(ctx, down.id);

    pinItems(ctx, { ids: [pinned.id], pinned: true, actor: you }, now);
    setOrder(ctx, { collection: 'Criaturas', ids: [ordered.id], actor: you }, now);
    pinItems(ctx, { ids: [down.id], pinned: false, actor: you }, now);

    expect(lifts(ctx, pinned.id)).toEqual([{ actor: 'fede', by: 'kiln', cause: 'pin' }]);
    expect(lifts(ctx, ordered.id)).toEqual([{ actor: 'fede', by: 'kiln', cause: 'order' }]);
    expect(lifts(ctx, down.id)).toEqual([]);
  });

  it('lifts with Retomar, and refuses Retomar on an item nobody set aside', () => {
    const ctx = memoryContext();
    waitingBoard(ctx);
    const along = animating(ctx);
    setAside(ctx, along.id);

    resumeItem(ctx, { id: along.id, actor: you, channel: 'ui' }, now);

    expect(lifts(ctx, along.id)).toEqual([
      { actor: 'fede', by: 'kiln', cause: 'resume', channel: 'ui' },
    ]);
    const refused = refusal(() =>
      resumeItem(ctx, { id: along.id, actor: you, channel: 'ui' }, now),
    );
    expect(refused.code).toBe('invalid_transition');
    expect(refused.message).toBe(`${along.id} is not set aside: there is nothing to take up again`);
  });

  it('writes nothing when the item was not set aside', () => {
    const ctx = memoryContext();
    waitingBoard(ctx);
    const along = animating(ctx);

    leaveNote(ctx, { id: along.id, text: 'Hola', actor: you, channel: 'ui' }, now);
    pinItems(ctx, { ids: [along.id], pinned: true, actor: you }, now);

    expect(lifts(ctx, along.id)).toEqual([]);
  });
});

describe('next with nothing to do', () => {
  it('names a set-aside item that stands in the person’s order, with the claim that takes it up', () => {
    const ctx = memoryContext();
    waitingBoard(ctx);
    const first = animating(ctx, 'Primera');
    const loose = animating(ctx, 'Suelta');
    setOrder(ctx, { collection: 'Criaturas', ids: [first.id], actor: you }, now);
    setAside(ctx, first.id);
    setAside(ctx, loose.id);

    const answer = nextFor(ctx, 'kiln', {}, now);

    expect(answer).toMatchObject({ item: null, idle: true });
    expect(answer.text).toContain(
      `You set aside ${first.id}, ${loose.id} for later. ${first.id} is number 1 in the order the person fixed on the Matrix: otea claim ${first.id} takes it up again.`,
    );
  });
});
