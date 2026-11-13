import { describe, expect, it } from 'vitest';
import { cambios, errores, tareasDeRepo } from '../core/board/testing.ts';
import { OteaError } from '../core/errors.ts';
import type { RefusalDetails } from '../core/refusal.ts';
import { updateItemState } from '../store/queries.ts';
import type { Context } from './context.ts';
import { createItem, getItem, moveItem, requireItem, updateItem } from './items.ts';
import { handoffItem, sendBackItem } from './next.ts';
import { linkItems } from './relations.ts';
import { reassignItem, restartItem, undoRelease } from './restart.ts';
import { memoryContext, publishAs } from './testing.ts';
import { undoMove } from './undo.ts';

// The refusals the web UI shows carry what they say as data, so the UI words them in its own
// language; the English message stays the agents'.

const you = { kind: 'human' as const, name: 'human' };
const mender = { kind: 'agent' as const, name: 'mender' };
let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 12, 9, 0, tick++)).toISOString();

function details(run: () => unknown): { code: string; details: RefusalDetails | undefined } {
  try {
    run();
  } catch (error) {
    if (error instanceof OteaError) return { code: error.code, details: error.details };
    throw error;
  }
  throw new Error('expected a refusal');
}

function bugInFix(ctx: Context) {
  publishAs(ctx, errores(), 'berr', now);
  const bug = createItem(
    ctx,
    { collection: 'Errores', title: 'Faro', fields: {}, actor: you, channel: 'ui' },
    now,
  );
  updateItem(ctx, { id: bug.id, fields: { fsteps: 'abrir' }, actor: mender }, now);
  handoffItem(ctx, { id: bug.id, actor: mender, channel: 'cli' }, now);
  updateItem(ctx, { id: bug.id, fields: { fcat: 'cgame' }, actor: you }, now);
  handoffItem(ctx, { id: bug.id, actor: you, channel: 'ui' }, now);
  return bug.id;
}

function change(ctx: Context) {
  publishAs(ctx, tareasDeRepo(), 'brt', now);
  publishAs(ctx, cambios(), 'bcam', now);
  const parent = createItem(
    ctx,
    { collection: 'Cambios', title: 'Nube', fields: { fwhat: 'x' }, actor: you, channel: 'ui' },
    now,
  );
  const part = createItem(
    ctx,
    {
      collection: 'Tareas de repo',
      title: 'API',
      fields: { frepo: 'api', fbranch: 'feat/a' },
      parent: parent.id,
      actor: you,
      channel: 'ui',
    },
    now,
  );
  return { id: parent.id, part: part.id };
}

describe('the details of a refusal', () => {
  it('name the parts an approval waits for again (the owner’s Rondas case)', () => {
    const ctx = memoryContext();
    const { id, part } = change(ctx);
    updateItemState(ctx.db, id, 'sexec__review', now());

    expect(
      details(() => moveItem(ctx, { id, to: 'done', actor: you, channel: 'ui' }, now)),
    ).toEqual({
      code: 'children_open',
      details: {
        kind: 'approval',
        item: id,
        missing: [
          expect.objectContaining({
            ref: 'wait:parts',
            open: [expect.objectContaining({ id: part, step: 'Propuesta' })],
            total: 1,
          }),
        ],
      },
    });
  });

  it('list what a handoff lacks, the note included', () => {
    const ctx = memoryContext();
    const id = bugInFix(ctx);
    const refused = details(() => handoffItem(ctx, { id, actor: you, channel: 'ui' }, now));
    expect(refused.code).toBe('missing_fields');
    expect(refused.details).toMatchObject({ kind: 'handoff', item: id });
    expect(
      refused.details?.kind === 'handoff' && refused.details.missing.map((m) => m.ref),
    ).toEqual(expect.arrayContaining(['note']));
  });

  it('say why a discard was refused, with the board’s motives', () => {
    const ctx = memoryContext();
    const id = bugInFix(ctx);
    expect(
      details(() =>
        moveItem(ctx, { id, to: 'dropped', actor: you, channel: 'ui', reason: 'x' }, now),
      ),
    ).toEqual({
      code: 'reason_required',
      details: {
        kind: 'drop',
        item: id,
        board: 'Errores',
        why: 'motive_required',
        motives: ['Rechazado', 'Duplicado'],
      },
    });
  });

  it('tell a send-back and a way back without a reason apart', () => {
    const ctx = memoryContext();
    const id = bugInFix(ctx);
    expect(
      details(() => handoffItem(ctx, { id, actor: mender, channel: 'cli', way: 'Triar' }, now)),
    ).toEqual({ code: 'reason_required', details: { kind: 'way_back_reason', item: id } });
    expect(details(() => sendBackItem(ctx, { id, actor: you, channel: 'ui' }, now))).toEqual({
      code: 'reason_required',
      details: { kind: 'send_back_reason', item: id },
    });
  });

  it('name an item that is gone, and one that ended', () => {
    const ctx = memoryContext();
    const id = bugInFix(ctx);
    expect(details(() => requireItem(ctx.db, 'ERR-99'))).toEqual({
      code: 'not_found',
      details: { kind: 'item_missing', item: 'ERR-99' },
    });
    moveItem(ctx, { id, to: 'dropped__rejected', actor: you, channel: 'ui', reason: 'no' }, now);
    expect(
      details(() => updateItem(ctx, { id, fields: { fsteps: 'x' }, actor: you }, now)),
    ).toEqual({ code: 'item_closed', details: { kind: 'closed', item: id } });
  });

  it('say why an undo is no longer honoured', () => {
    const ctx = memoryContext();
    const id = bugInFix(ctx);
    expect(
      details(() => undoMove(ctx, { id, from: 'striage', actor: mender, channel: 'cli' })),
    ).toEqual({
      code: 'not_undoable',
      details: { kind: 'undo', item: id, why: 'not_yours' },
    });
    expect(details(() => undoRelease(ctx, { id, actor: you, channel: 'ui' }))).toEqual({
      code: 'not_undoable',
      details: { kind: 'undo_release', item: id, why: 'not_release' },
    });
  });

  it('say an item is not stuck, and an agent name that cannot be one', () => {
    const ctx = memoryContext();
    const id = bugInFix(ctx);
    expect(details(() => restartItem(ctx, { id, actor: you, channel: 'ui' }))).toEqual({
      code: 'not_stuck',
      details: { kind: 'not_stuck', item: id },
    });
    expect(
      details(() => reassignItem(ctx, { id, agent: 'No Vale', actor: you, channel: 'ui' })),
    ).toEqual({ code: 'invalid_agent_name', details: { kind: 'agent_name', name: 'No Vale' } });
  });

  it('say why a link was refused', () => {
    const ctx = memoryContext();
    const { id, part } = change(ctx);
    expect(
      details(() => linkItems(ctx, { id, kind: 'blocks', other: id, actor: you, channel: 'ui' })),
    ).toEqual({ code: 'self_relation', details: { kind: 'self_link', item: id } });
    expect(
      details(() =>
        linkItems(ctx, { id: part, kind: 'parent', other: id, actor: you, channel: 'ui' }),
      ),
    ).toEqual({ code: 'already_exists', details: { kind: 'already_linked' } });
    expect(getItem(ctx, part).id).toBe(part);
  });
});
