import { describe, expect, it } from 'vitest';
import { stateOf } from '../core/board/engine.ts';
import { sequenceIds } from '../core/board/ids.ts';
import type { BoardDefinition } from '../core/board/model.ts';
import { handedText, idleText, nextText, refusalText } from '../core/board/next.ts';
import { creatures } from '../core/board/testing.ts';
import { insertEvidence } from '../store/queries.ts';
import { createBoard, publishBoard, saveDraft } from './boards.ts';
import type { Context } from './context.ts';
import { createItem, getItem } from './items.ts';
import {
  approveItem,
  handoffItem,
  itemNextText,
  itemOnBoard,
  nextFor,
  sendBackItem,
} from './next.ts';
import { memoryContext } from './testing.ts';

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
      text: idleText(def, 0),
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
    board(ctx);
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
