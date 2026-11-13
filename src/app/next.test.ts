import { describe, expect, it } from 'vitest';
import { stateOf } from '../core/board/engine.ts';
import { sequenceIds } from '../core/board/ids.ts';
import type { BoardDefinition } from '../core/board/model.ts';
import { handedText, idleText, nextText, noWayText, refusalText } from '../core/board/next.ts';
import { creatures } from '../core/board/testing.ts';
import { timeText } from '../core/time.ts';
import { insertEvidence, selectEvents } from '../store/queries.ts';
import { createBoard, publishBoard, saveDraft } from './boards.ts';
import type { Context } from './context.ts';
import { createItem, getItem, moveItem, updateItem } from './items.ts';
import { claimItem } from './leases.ts';
import {
  approveItem,
  handoffItem,
  itemNextText,
  itemOnBoard,
  nextFor,
  OFFER_MS,
  sendBackItem,
} from './next.ts';
import { reassignItem } from './restart.ts';
import { memoryContext } from './testing.ts';
import { undoMove } from './undo.ts';

const you = { kind: 'human' as const, name: 'fede' };
const kiln = { kind: 'agent' as const, name: 'kiln' };
const scout = { kind: 'agent' as const, name: 'scout' };
const quill = { kind: 'agent' as const, name: 'quill' };

let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 12, 9, 0, tick++)).toISOString();

function board(ctx: Context, def: BoardDefinition = creatures()) {
  const record = createBoard(ctx, { name: def.name, lang: 'es' }, now, sequenceIds());
  saveDraft(ctx, record.id, { definition: def, baseVersion: null }, now);
  publishBoard(ctx, record.id, { moves: {}, by: you }, now);
  return def;
}

function creature(ctx: Context, title = 'Tortuga') {
  return createItem(
    ctx,
    { collection: 'Criaturas', title, fields: { fdesc: 'Lenta' }, actor: you, channel: 'ui' },
    now,
  );
}

// Fills what Animar hands off: its checklist and a new animation.
function ready(ctx: Context, id: string) {
  ctx.db
    .prepare('UPDATE items SET fields = ? WHERE id = ?')
    .run(JSON.stringify({ fdesc: 'Lenta', fsteps: '["cone","ctwo"]' }), id);
  attach(ctx, id, 'eanim');
}

function attach(ctx: Context, id: string, module: string) {
  insertEvidence(ctx.db, {
    itemId: id,
    role: 'after',
    module,
    kind: 'image',
    filename: 'a.png',
    contentType: 'image/png',
    size: 1,
    sha256: 'a'.repeat(64),
    caption: null,
    createdAt: now(),
    actor: kiln,
    channel: 'cli',
  });
}

describe('the next service', () => {
  it('reads an item as the engine does: fields, evidence by part, and its round', () => {
    const ctx = memoryContext();
    const def = board(ctx);
    const item = creature(ctx);
    attach(ctx, item.id, 'eart');

    const on = itemOnBoard(ctx, getItem(ctx, item.id), def);

    expect(on.position).toEqual({ step: 'sconcept', phase: 'doing' });
    expect(on.round).toBe(1);
    expect(on.facts.fields).toMatchObject({ fdesc: 'Lenta', title: 'Tortuga' });
    expect(on.facts.evidence.map(({ part }) => part)).toEqual(['eart']);
    expect(on.facts.roundStartedAt).toBe(item.createdAt);
  });

  it('answers next with the oldest item the agent may take, in the writer’s exact words', () => {
    const ctx = memoryContext();
    const def = board(ctx);
    const first = creature(ctx, 'Tortuga');
    creature(ctx, 'Rana');

    const answer = nextFor(ctx, 'quill', {}, now);

    expect(answer.item).toBe(first.id);
    expect(answer.text).toBe(
      nextText(def, {
        id: first.id,
        title: 'Tortuga',
        position: { step: 'sconcept', phase: 'doing' },
        round: 1,
        fields: { fdesc: 'Lenta' },
        evidence: {},
        missing: [{ ref: 'eart', name: 'Arte conceptual', reason: 'missing', fresh: true }],
        me: 'quill',
      }),
    );
    expect(itemNextText(ctx, getItem(ctx, first.id), 'quill')).toBe(answer.text);
  });

  it('answers with the board’s idle words when nothing is the agent’s', () => {
    const ctx = memoryContext();
    const def = board(ctx, { ...creatures(), idle: 'Revisa el pantano.', cap: { on: true, n: 2 } });

    expect(nextFor(ctx, 'kiln', { collection: 'Criaturas' }, now)).toEqual({
      item: null,
      collection: 'Criaturas',
      text: idleText([{ def, waitingForYou: 0 }], 'Criaturas'),
    });
  });

  it('refuses a handoff that lacks something, with the exact refusal, and lets it through after', () => {
    const ctx = memoryContext();
    board(ctx);
    const item = creature(ctx);
    const early = () => handoffItem(ctx, { id: item.id, actor: quill, channel: 'cli' }, now);

    expect(early).toThrowError(
      refusalText(item.id, [
        { ref: 'eart', name: 'Arte conceptual', reason: 'missing', fresh: true },
      ]),
    );
    attach(ctx, item.id, 'eart');
    const handed = handoffItem(ctx, { id: item.id, actor: quill, channel: 'cli' }, now);

    expect(handed.item.state).toBe(stateOf({ step: 'sconcept', phase: 'review' }));
    expect(handed.text).toBe(
      handedText(creatures(), item.id, { step: 'sconcept', phase: 'review' }),
    );
  });

  it('runs a whole round: approve, send back to Concepto, and next says round 2', () => {
    const ctx = memoryContext();
    board(ctx);
    const item = creature(ctx);
    attach(ctx, item.id, 'eart');
    handoffItem(ctx, { id: item.id, actor: quill, channel: 'cli' }, now);
    approveItem(ctx, { id: item.id, actor: you, channel: 'ui' }, now);
    expect(getItem(ctx, item.id).state).toBe('sanimate');

    ctx.db
      .prepare('UPDATE items SET fields = ? WHERE id = ?')
      .run(JSON.stringify({ fdesc: 'Lenta', fsteps: '["cone","ctwo"]' }), item.id);
    attach(ctx, item.id, 'eanim');
    handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, now);
    expect(getItem(ctx, item.id).state).toBe('sanimate__review');
    expect(nextFor(ctx, 'scout', {}, now).item).toBe(item.id);

    const back = sendBackItem(
      ctx,
      { id: item.id, actor: scout, channel: 'mcp', reason: 'Más barro' },
      now,
    );

    expect(back.item.state).toBe('sconcept');
    expect(nextFor(ctx, 'quill', {}, now).text).toContain('Concepto, round 2');
    // The concept art from round 1 is not new this round.
    expect(() => handoffItem(ctx, { id: item.id, actor: quill, channel: 'cli' }, now)).toThrowError(
      /Arte conceptual \(new this round\)/,
    );
  });

  it('refuses a step out of turn as forbidden, and a way the step has not', () => {
    const ctx = memoryContext();
    const def = creatures();
    def.steps = def.steps.map((s) => (s.id === 'sanimate' ? { ...s, doer: 'you' as const } : s));
    board(ctx, def);
    const item = creature(ctx);
    attach(ctx, item.id, 'eart');
    handoffItem(ctx, { id: item.id, actor: quill, channel: 'cli' }, now);

    expect(() => approveItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, now)).toThrowError(
      expect.objectContaining({ code: 'forbidden' }),
    );
    expect(() =>
      approveItem(ctx, { id: item.id, actor: you, channel: 'ui', way: 'Pulir' }, now),
    ).toThrowError(expect.objectContaining({ code: 'invalid_transition' }));
    expect(
      approveItem(ctx, { id: item.id, actor: you, channel: 'ui', way: 'Hecho' }, now).item.state,
    ).toBe('done');
    const other = creature(ctx, 'Rana');
    attach(ctx, other.id, 'eart');
    handoffItem(ctx, { id: other.id, actor: quill, channel: 'cli' }, now);
    approveItem(ctx, { id: other.id, actor: you, channel: 'ui' }, now);
    expect(() =>
      handoffItem(ctx, { id: other.id, actor: quill, channel: 'cli' }, now),
    ).toThrowError(expect.objectContaining({ code: 'forbidden' }));
  });

  it('needs a reason to send back', () => {
    const ctx = memoryContext();
    board(ctx);
    const item = creature(ctx);

    expect(() => sendBackItem(ctx, { id: item.id, actor: you, channel: 'ui' }, now)).toThrowError(
      expect.objectContaining({ code: 'reason_required' }),
    );
  });
});

describe('a round sent back', () => {
  // Tortuga handed off and sent back by the person with a note; Rana, older, still in Concepto.
  function sentBackTortuga(ctx: Context) {
    board(ctx);
    const older = creature(ctx, 'Rana');
    const item = creature(ctx, 'Tortuga');
    attach(ctx, item.id, 'eart');
    handoffItem(ctx, { id: item.id, actor: quill, channel: 'cli' }, now);
    const back = sendBackItem(
      ctx,
      { id: item.id, actor: you, channel: 'ui', reason: 'Más barro en las patas' },
      now,
    );
    return { item, older, at: back.item.updatedAt };
  }

  it('starts the agent’s next round with the note, who sent it, when and from which review', () => {
    const ctx = memoryContext();
    const { item, at } = sentBackTortuga(ctx);
    const sentBack = {
      note: 'Más barro en las patas',
      by: { kind: 'human' as const, name: 'fede' },
      at,
      step: 'Concepto',
      round: 1,
    };

    const answer = nextFor(ctx, 'quill', {}, now);

    expect(answer.item).toBe(item.id);
    expect(answer.sentBack).toEqual(sentBack);
    expect(answer.text).toContain(
      `Concepto, round 2\nYour turn: do this step.\nClaim it first: otea claim ${item.id} (otea next --claim takes and claims the next in one call).\n\nSent back to you: "Más barro en las patas"\n  by the person, `,
    );
    expect(itemNextText(ctx, getItem(ctx, item.id), 'quill')).toBe(answer.text);
    expect(itemOnBoard(ctx, getItem(ctx, item.id), creatures()).sentBack).toEqual(sentBack);
  });

  it('puts a returned item before older ones', () => {
    const ctx = memoryContext();
    const { item, older } = sentBackTortuga(ctx);

    expect(nextFor(ctx, 'quill', {}, now).item).toBe(item.id);
    attach(ctx, item.id, 'eart');
    handoffItem(ctx, { id: item.id, actor: quill, channel: 'cli', note: 'Barro añadido' }, now);
    expect(nextFor(ctx, 'quill', {}, now).item).toBe(older.id);
  });

  it('refuses to hand it off again without a note for that round, then takes it with one', () => {
    const ctx = memoryContext();
    const { item } = sentBackTortuga(ctx);
    attach(ctx, item.id, 'eart');
    const bare = () => handoffItem(ctx, { id: item.id, actor: quill, channel: 'cli' }, now);

    expect(bare).toThrowError(
      'Not handed off CRI-2: missing a note (it was sent back: say what you changed).',
    );
    expect(bare).toThrowError(expect.objectContaining({ code: 'missing_fields' }));
    const handed = handoffItem(
      ctx,
      { id: item.id, actor: quill, channel: 'cli', note: 'Barro añadido' },
      now,
    );

    expect(handed.item.state).toBe(stateOf({ step: 'sconcept', phase: 'review' }));
    expect(itemOnBoard(ctx, getItem(ctx, item.id), creatures()).sentBack).toBeUndefined();
  });

  it('holds otea move to the same note', () => {
    const ctx = memoryContext();
    const { item } = sentBackTortuga(ctx);
    attach(ctx, item.id, 'eart');
    const review = stateOf({ step: 'sconcept', phase: 'review' });

    expect(() =>
      moveItem(ctx, { id: item.id, to: review, actor: quill, channel: 'cli' }, now),
    ).toThrowError(/missing a note/);
    expect(
      moveItem(
        ctx,
        { id: item.id, to: review, actor: quill, channel: 'cli', note: 'Barro añadido' },
        now,
      ).state,
    ).toBe(review);
  });

  it('names the agent reviewer that asked for another round', () => {
    const ctx = memoryContext();
    board(ctx);
    const item = creature(ctx);
    attach(ctx, item.id, 'eart');
    handoffItem(ctx, { id: item.id, actor: quill, channel: 'cli' }, now);
    approveItem(ctx, { id: item.id, actor: you, channel: 'ui' }, now);
    ctx.db
      .prepare('UPDATE items SET fields = ? WHERE id = ?')
      .run(JSON.stringify({ fdesc: 'Lenta', fsteps: '["cone","ctwo"]' }), item.id);
    attach(ctx, item.id, 'eanim');
    handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, now);
    sendBackItem(ctx, { id: item.id, actor: scout, channel: 'mcp', reason: 'Más barro' }, now);

    expect(nextFor(ctx, 'quill', {}, now).sentBack).toMatchObject({
      note: 'Más barro',
      by: { kind: 'agent', name: 'scout' },
      step: 'Animar',
      round: 1,
    });
  });
});

describe('the old paths on a board', () => {
  it('refuses a move into a review while the handoff lacks something, in the same words', () => {
    const ctx = memoryContext();
    board(ctx);
    const item = creature(ctx);
    const move = () =>
      moveItem(ctx, { id: item.id, to: 'sconcept__review', actor: quill, channel: 'cli' }, now);

    expect(move).toThrowError(
      refusalText(item.id, [
        { ref: 'eart', name: 'Arte conceptual', reason: 'missing', fresh: true },
      ]),
    );
    attach(ctx, item.id, 'eart');
    expect(move().state).toBe('sconcept__review');
  });

  it('refuses a claim of a step the person does, and of the review of its own round', () => {
    const ctx = memoryContext();
    const def = creatures();
    def.steps = def.steps.map((s) => (s.id === 'sconcept' ? { ...s, doer: 'you' as const } : s));
    board(ctx, def);
    const item = creature(ctx);
    expect(() => claimItem(ctx, { id: item.id, actor: quill }, now)).toThrowError(
      'CRI-1 is in Concepto (turn human); only items on the agent turn can be claimed',
    );
    attach(ctx, item.id, 'eart');
    handoffItem(ctx, { id: item.id, actor: you, channel: 'ui' }, now);
    approveItem(ctx, { id: item.id, actor: you, channel: 'ui' }, now);
    ready(ctx, item.id);
    handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, now);

    expect(() => claimItem(ctx, { id: item.id, actor: kiln }, now)).toThrowError(
      'CRI-1 waits for another agent to review Animar (you did it in this round); claim only what is yours (otea next)',
    );
    expect(claimItem(ctx, { id: item.id, actor: scout }, now).lease?.holder).toBe('scout');
  });

  it('lets an agent move into the review of its own work, never out of it', () => {
    const ctx = memoryContext();
    board(ctx);
    const item = creature(ctx);
    attach(ctx, item.id, 'eart');
    handoffItem(ctx, { id: item.id, actor: quill, channel: 'cli' }, now);
    approveItem(ctx, { id: item.id, actor: you, channel: 'ui' }, now);
    ready(ctx, item.id);
    claimItem(ctx, { id: item.id, actor: scout }, now);

    expect(
      moveItem(ctx, { id: item.id, to: 'sanimate__review', actor: scout, channel: 'cli' }, now)
        .state,
    ).toBe('sanimate__review');
    expect(() =>
      moveItem(ctx, { id: item.id, to: 'spolish', actor: scout, channel: 'cli' }, now),
    ).toThrowError(
      expect.objectContaining({
        code: 'forbidden',
        details: expect.objectContaining({ kind: 'own_review', who: 'scout' }),
      }),
    );
  });

  it('refuses the review of an agent that did the round, whoever handed it off', () => {
    const ctx = memoryContext();
    board(ctx);
    const item = creature(ctx);
    attach(ctx, item.id, 'eart');
    handoffItem(ctx, { id: item.id, actor: quill, channel: 'cli' }, now);
    approveItem(ctx, { id: item.id, actor: you, channel: 'ui' }, now);
    ready(ctx, item.id);
    updateItem(ctx, { id: item.id, fields: { Bioma: 'Bosque' }, actor: quill }, now);
    handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, now);

    for (const actor of [kiln, quill]) {
      expect(() => approveItem(ctx, { id: item.id, actor, channel: 'cli' }, now)).toThrowError(
        `Not your review: ${actor.name} did Animar on CRI-1 in this round, so another agent reviews it; pick another item (otea next)`,
      );
      expect(() =>
        sendBackItem(ctx, { id: item.id, actor, channel: 'cli', reason: 'otra' }, now),
      ).toThrowError(expect.objectContaining({ code: 'forbidden' }));
      expect(nextFor(ctx, actor.name, {}, now).item).toBeNull();
    }
    expect(nextFor(ctx, 'scout', {}, now).item).toBe(item.id);
    expect(
      moveItem(ctx, { id: item.id, to: 'spolish', actor: scout, channel: 'cli' }, now).state,
    ).toBe('spolish');
  });

  it('lets the agent that did an earlier round review the next one', () => {
    const ctx = memoryContext();
    board(ctx);
    const item = creature(ctx);
    attach(ctx, item.id, 'eart');
    handoffItem(ctx, { id: item.id, actor: quill, channel: 'cli' }, now);
    approveItem(ctx, { id: item.id, actor: you, channel: 'ui' }, now);
    ready(ctx, item.id);
    handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, now);
    sendBackItem(ctx, { id: item.id, actor: scout, channel: 'cli', reason: 'Más barro' }, now);
    attach(ctx, item.id, 'eart');
    handoffItem(ctx, { id: item.id, actor: quill, channel: 'cli', note: 'barro' }, now);
    approveItem(ctx, { id: item.id, actor: you, channel: 'ui' }, now);
    attach(ctx, item.id, 'eanim');
    handoffItem(ctx, { id: item.id, actor: scout, channel: 'cli', note: 'más barro' }, now);

    expect(nextFor(ctx, 'scout', {}, now).item).toBeNull();
    expect(nextFor(ctx, 'kiln', {}, now).text).toContain(
      'Your turn: review this step (scout did it).',
    );
  });
});

describe('leases on a board', () => {
  // Concepto hands straight on to Animar, which any agent does.
  function straight(ctx: Context) {
    const def = creatures();
    def.steps = def.steps.map((s) =>
      s.id === 'sconcept'
        ? { ...s, reviewer: 'none' as const, ways: [] }
        : s.id === 'sanimate'
          ? { ...s, doer: 'any' as const, reviewer: 'you' as const }
          : s,
    );
    return board(ctx, def);
  }

  it('releases the lease when a step with no review hands the item on to the next step', () => {
    const ctx = memoryContext();
    straight(ctx);
    const item = creature(ctx);
    attach(ctx, item.id, 'eart');
    claimItem(ctx, { id: item.id, actor: quill }, now);

    const moved = handoffItem(ctx, { id: item.id, actor: quill, channel: 'cli' }, now).item;

    expect(moved.state).toBe('sanimate');
    expect(moved.lease).toBeNull();
    expect(getItem(ctx, item.id).lease).toBeNull();
    const released = selectEvents(ctx.db, item.id).filter(({ type }) => type === 'released');
    expect(released.map(({ data }) => data)).toEqual([{ holder: 'quill', cause: 'handoff' }]);
    // Another agent takes the next step at once; the one that handed it off claims again to go on.
    expect(nextFor(ctx, 'scout', {}, now).item).toBe(item.id);
    expect(claimItem(ctx, { id: item.id, actor: quill }, now).lease?.holder).toBe('quill');
  });

  it('does not carry the doer’s lease into an agent’s review of the step', () => {
    const ctx = memoryContext();
    board(ctx);
    const item = creature(ctx);
    attach(ctx, item.id, 'eart');
    handoffItem(ctx, { id: item.id, actor: quill, channel: 'cli' }, now);
    approveItem(ctx, { id: item.id, actor: you, channel: 'ui' }, now);
    ctx.db
      .prepare('UPDATE items SET fields = ? WHERE id = ?')
      .run(JSON.stringify({ fdesc: 'Lenta', fsteps: '["cone","ctwo"]' }), item.id);
    attach(ctx, item.id, 'eanim');
    claimItem(ctx, { id: item.id, actor: kiln }, now);

    const moved = handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, now).item;

    expect(moved.state).toBe('sanimate__review');
    expect(moved.lease).toBeNull();
    expect(nextFor(ctx, 'scout', {}, now).text).toContain('Your turn: review this step');
  });

  it('tells another agent who holds the item and until when, never that it is its turn', () => {
    const ctx = memoryContext();
    board(ctx);
    const item = creature(ctx);
    const held = claimItem(ctx, { id: item.id, actor: quill }, now);

    const text = itemNextText(ctx, getItem(ctx, item.id, now), 'scout', now) ?? '';

    expect(text).toBe(
      `CRI-1 · Criatura · Concepto, round 1\nHeld by quill until ${timeText(held.lease?.expiresAt ?? '')}: pick another item.`,
    );
    expect(itemNextText(ctx, getItem(ctx, item.id, now), 'quill', now)).toContain('Your turn');
  });

  it('says whom the person left a stuck item for, and offers it only to that agent', () => {
    const ctx = memoryContext();
    board(ctx);
    const item = creature(ctx);
    claimItem(ctx, { id: item.id, actor: quill, ttlMs: 1000 }, now);
    tick += 5;
    reassignItem(ctx, { id: item.id, agent: 'kiln', actor: you, channel: 'ui' }, now);

    expect(itemNextText(ctx, getItem(ctx, item.id, now), 'scout', now)).toBe(
      'CRI-1 · Criatura · Concepto, round 1\nLeft for kiln: pick another item.',
    );
    expect(itemNextText(ctx, getItem(ctx, item.id, now), 'kiln', now)).toContain(
      'Your turn: do this step.\nThe person left it for you.',
    );
    expect(nextFor(ctx, 'scout', {}, now).item).toBeNull();
    expect(nextFor(ctx, 'kiln', {}, now).item).toBe(item.id);
    // Once kiln claims it, it is kiln's like any held item.
    claimItem(ctx, { id: item.id, actor: kiln }, now);
    expect(itemNextText(ctx, getItem(ctx, item.id, now), 'kiln', now)).not.toContain(
      'left it for you',
    );
  });
});

describe('rounds across a publish', () => {
  it('starts no new round when a publish reopens a review, so fresh evidence still counts', () => {
    const ctx = memoryContext();
    const record = createBoard(ctx, { name: 'Criaturas', lang: 'es' }, now, sequenceIds());
    saveDraft(ctx, record.id, { definition: creatures(), baseVersion: null }, now);
    publishBoard(ctx, record.id, { moves: {}, by: you }, now);
    const item = creature(ctx);
    attach(ctx, item.id, 'eart');
    handoffItem(ctx, { id: item.id, actor: quill, channel: 'cli' }, now);
    const next = creatures();
    next.steps = next.steps.map((s) =>
      s.id === 'sconcept' ? { ...s, reviewer: 'none', ways: [] } : s,
    );
    saveDraft(ctx, record.id, { definition: next, baseVersion: 1 }, now);
    publishBoard(ctx, record.id, { moves: {}, by: you }, now);
    expect(getItem(ctx, item.id).state).toBe('sconcept');

    expect(itemOnBoard(ctx, getItem(ctx, item.id), next).round).toBe(1);
    expect(handoffItem(ctx, { id: item.id, actor: quill, channel: 'cli' }, now).item.state).toBe(
      'sanimate',
    );
  });
});

describe('names on a board', () => {
  it('fills a field and a choice by their names, and refuses a name the board has not in words', () => {
    const ctx = memoryContext();
    board(ctx);
    const item = creature(ctx);
    const updated = updateItem(ctx, { id: item.id, fields: { Bioma: 'Bosque' }, actor: kiln }, now);
    expect(updated.fields.fbiome).toBe('cwood');
    expect(() =>
      updateItem(ctx, { id: item.id, fields: { Tamaño: 'Una' }, actor: kiln }, now),
    ).toThrowError(/Criaturas has no field "Tamaño"; its fields are /);
    const moved = moveItem(
      ctx,
      { id: item.id, to: 'Descartado', actor: you, channel: 'ui', reason: 'Repetida' },
      now,
    );
    expect(moved.state).toBe('dropped');
  });
});

describe('rounds and Deshacer', () => {
  // Tortuga handed off in Concepto, waiting for the person's verdict.
  function handedTortuga(ctx: Context) {
    board(ctx);
    const item = creature(ctx, 'Tortuga');
    attach(ctx, item.id, 'eart');
    handoffItem(ctx, { id: item.id, actor: quill, channel: 'cli' }, now);
    return item;
  }
  const review = stateOf({ step: 'sconcept', phase: 'review' });

  it('takes an approval back without starting another round of the next step', () => {
    const ctx = memoryContext();
    const item = handedTortuga(ctx);
    approveItem(ctx, { id: item.id, actor: you, channel: 'ui' }, now);
    undoMove(ctx, { id: item.id, from: review, actor: you, channel: 'ui' }, now);
    approveItem(ctx, { id: item.id, actor: you, channel: 'ui' }, now);

    const on = itemOnBoard(ctx, getItem(ctx, item.id), creatures());
    expect(on.position).toEqual({ step: 'sanimate', phase: 'doing' });
    expect(on.round).toBe(1);
  });

  it('takes a send-back back: the step keeps its round and no note waits for the agent', () => {
    const ctx = memoryContext();
    const item = handedTortuga(ctx);
    sendBackItem(ctx, { id: item.id, actor: you, channel: 'ui', reason: 'Más barro' }, now);
    undoMove(ctx, { id: item.id, from: review, actor: you, channel: 'ui' }, now);

    const on = itemOnBoard(ctx, getItem(ctx, item.id), creatures());
    expect(on.position).toEqual({ step: 'sconcept', phase: 'review' });
    expect(on.rounds.rounds.sconcept).toBe(1);
    sendBackItem(ctx, { id: item.id, actor: you, channel: 'ui', reason: 'Más musgo' }, now);
    const again = itemOnBoard(ctx, getItem(ctx, item.id), creatures());
    expect(again.round).toBe(2);
    expect(again.sentBack?.note).toBe('Más musgo');
  });
});

describe('next among several agents', () => {
  // A clock the test moves: one second per reading, and `later` jumps ahead.
  function clock() {
    let at = Date.UTC(2026, 10, 12, 9, 0, 0);
    const read = () => {
      at += 1000;
      return new Date(at).toISOString();
    };
    const later = (ms: number) => {
      at += ms;
    };
    return Object.assign(read, { later });
  }

  it('never offers the item it just offered one agent to another', () => {
    const ctx = memoryContext();
    board(ctx);
    const first = creature(ctx, 'Tortuga');
    const second = creature(ctx, 'Rana');
    const at = clock();

    expect(nextFor(ctx, 'quill', {}, at).item).toBe(first.id);
    expect(nextFor(ctx, 'kiln', {}, at).item).toBe(second.id);
    // Asked again, each agent keeps its own offer.
    expect(nextFor(ctx, 'quill', {}, at).item).toBe(first.id);
    expect(nextFor(ctx, 'scout', {}, at).item).toBeNull();
  });

  it('offers it to another agent once the offer runs out unclaimed, or the item moved on', () => {
    const ctx = memoryContext();
    board(ctx);
    const item = creature(ctx);
    const at = clock();
    nextFor(ctx, 'quill', {}, at);
    expect(nextFor(ctx, 'kiln', {}, at).item).toBeNull();

    at.later(OFFER_MS);

    expect(nextFor(ctx, 'kiln', {}, at).item).toBe(item.id);
    attach(ctx, item.id, 'eart');
    handoffItem(ctx, { id: item.id, actor: kiln, channel: 'cli' }, at);
    approveItem(ctx, { id: item.id, actor: you, channel: 'ui' }, at);
    expect(nextFor(ctx, 'kiln', {}, at).item).toBe(item.id);
  });

  it('takes and claims the next item in one call with claim', () => {
    const ctx = memoryContext();
    board(ctx);
    const first = creature(ctx, 'Tortuga');
    const second = creature(ctx, 'Rana');
    const at = clock();

    const taken = nextFor(ctx, 'quill', { claim: true }, at);

    expect(taken.item).toBe(first.id);
    const lease = taken.lease;
    expect(lease?.holder).toBe('quill');
    expect(taken.text).toContain(
      `You hold it until ${timeText(lease?.expiresAt ?? '')}; otea heartbeat ${first.id} keeps it longer.`,
    );
    expect(selectEvents(ctx.db, first.id).at(-1)).toMatchObject({ type: 'claimed' });
    expect(nextFor(ctx, 'kiln', { claim: true }, at).item).toBe(second.id);
    expect(nextFor(ctx, 'scout', { claim: true }, at).item).toBeNull();
    // Asked again, the holder gets its own item back, still held.
    expect(nextFor(ctx, 'quill', { claim: true }, at).item).toBe(first.id);
  });

  it('says once that there is nothing to do on every board, and how to wait', () => {
    const ctx = memoryContext();
    const def = board(ctx);
    const other = { ...creatures(), name: 'Plantas' };
    const plants = createBoard(ctx, { name: 'Plantas', lang: 'es' }, now, (kind) => `${kind}p`);
    saveDraft(ctx, plants.id, { definition: other, baseVersion: null }, now);
    publishBoard(ctx, plants.id, { moves: {}, by: you }, now);

    expect(nextFor(ctx, 'kiln', {}, now).text).toBe(
      idleText([
        { def, waitingForYou: 0 },
        { def: other, waitingForYou: 0 },
      ]),
    );
  });

  it('lists the ways a step has when an agent names one it has not', () => {
    const ctx = memoryContext();
    const def = board(ctx);
    const item = creature(ctx);

    expect(() =>
      handoffItem(ctx, { id: item.id, actor: quill, channel: 'cli', way: 'Triar' }, now),
    ).toThrowError(noWayText(def, item.id, 'sconcept', 'Triar'));
  });
});
