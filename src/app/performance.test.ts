import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { creatures } from '../core/board/testing.ts';
import { OteaError } from '../core/errors.ts';
import { saveProfile } from '../store/queries.ts';
import type { Context } from './context.ts';
import { createItem } from './items.ts';
import { approveItem, handoffItem, sendBackItem } from './next.ts';
import { performanceOf } from './performance.ts';
import { memoryContext, publishAs } from './testing.ts';

const you = { kind: 'human' as const, name: 'fede' };
const quill = { kind: 'agent' as const, name: 'quill' };

let tick = 0;
const clock = () => new Date(Date.UTC(2026, 10, 1, 9, tick++)).toISOString();

describe('performanceOf: how each model performs on the project’s boards', () => {
  let ctx: Context;

  beforeEach(() => {
    tick = 0;
    ctx = memoryContext();
    // Concepto with nothing to attach, so a handoff goes through on its own.
    const def = creatures();
    for (const step of def.steps) step.hand = [];
    publishAs(ctx, def, 'bcri', clock);
    saveProfile(
      ctx.db,
      'quill',
      { harness: 'claude-code', model: 'claude-sonnet-5', effort: 'medium' },
      { at: clock(), channel: 'cli', confirmed: true },
    );
  });

  afterEach(() => ctx.db.close());

  function walk() {
    const item = createItem(
      ctx,
      { collection: 'Criaturas', title: 'Rana', fields: { fdesc: 'verde' }, actor: you },
      clock,
    );
    const by = { id: item.id, channel: 'cli' as const };
    handoffItem(ctx, { ...by, actor: quill }, clock);
    sendBackItem(ctx, { ...by, actor: you, channel: 'ui', reason: 'Más barro' }, clock);
    handoffItem(ctx, { ...by, actor: quill, note: 'Con barro' }, clock);
    approveItem(ctx, { ...by, actor: you, channel: 'ui' }, clock);
    return item.id;
  }

  it('reads every live board’s items with the profile on each handoff', () => {
    walk();

    const report = performanceOf(ctx, {}, clock);

    expect(report.rows).toEqual([
      expect.objectContaining({
        family: 'sonnet',
        effort: 'medium',
        handoffs: 2,
        sentBack: 1,
        finishedSteps: 1,
        rounds: 2,
      }),
    ]);
    expect(report.boards).toEqual(['Criaturas']);
  });

  it('keeps to the board named, in any case, and refuses one there is not', () => {
    walk();

    expect(performanceOf(ctx, { board: 'criaturas' }, clock).rows).toHaveLength(1);
    expect(() => performanceOf(ctx, { board: 'Nada' }, clock)).toThrow(OteaError);
  });

  it('keeps to the period asked', () => {
    walk();
    tick += 60 * 24 * 40;

    expect(performanceOf(ctx, { since: '30d' }, clock).rows).toEqual([]);
    expect(performanceOf(ctx, { since: 'all' }, clock).rows).toHaveLength(1);
  });
});
