import { describe, expect, it } from 'vitest';
import { cambios, errores, tareasDeRepo } from '../core/board/testing.ts';
import { OteaError } from '../core/errors.ts';
import { insertEvidence, updateItemState } from '../store/queries.ts';
import type { Context } from './context.ts';
import { createItem, getItem, moveItem, showItem, updateItem } from './items.ts';
import { approveItem, dropItem, handoffItem } from './next.ts';
import { memoryContext, publishAs } from './testing.ts';

const you = { kind: 'human' as const, name: 'fede' };
const mender = { kind: 'agent' as const, name: 'mender' };
let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 12, 9, 0, tick++)).toISOString();

function refusal(run: () => unknown): { code: string; message: string } {
  try {
    run();
  } catch (error) {
    if (error instanceof OteaError) return { code: error.code, message: error.message };
    throw error;
  }
  throw new Error('expected a refusal');
}

function attach(ctx: Context, id: string, module: string) {
  insertEvidence(ctx.db, {
    itemId: id,
    role: 'after',
    module,
    kind: 'file',
    filename: 'a.diff',
    contentType: 'text/x-diff',
    size: 1,
    sha256: 'a'.repeat(64),
    caption: null,
    createdAt: now(),
    actor: mender,
    channel: 'cli',
  });
}

// A bug walked to Arreglar: filled, triaged by the person.
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
  expect(getItem(ctx, bug.id).state).toBe('sfix');
  return bug.id;
}

describe('a way back', () => {
  it('needs a reason, then takes the item back for that step’s next round', () => {
    const ctx = memoryContext();
    const id = bugInFix(ctx);

    expect(
      refusal(() => handoffItem(ctx, { id, actor: mender, channel: 'cli', way: 'Triar' }, now)),
    ).toEqual({ code: 'reason_required', message: 'Not taken back: say why with --reason.' });

    const back = handoffItem(
      ctx,
      { id, actor: mender, channel: 'cli', way: 'Triar', reason: 'no es un bug' },
      now,
    );
    expect(back.text).toBe(`Taken back. ${id} returns to Triar, round 2.`);
    expect(getItem(ctx, id).state).toBe('striage');
  });
});

describe('the note of a handoff', () => {
  it('is required where the step asks, and is kept as the round’s note', () => {
    const ctx = memoryContext();
    const id = bugInFix(ctx);
    attach(ctx, id, 'ecode');

    expect(refusal(() => handoffItem(ctx, { id, actor: mender, channel: 'cli' }, now))).toEqual({
      code: 'missing_fields',
      message: `Not handed off ${id}: missing a note.\nCall handoff again with --note "la prueba".`,
    });

    const done = handoffItem(
      ctx,
      { id, actor: mender, channel: 'cli', note: 'abrí el faro y se enciende' },
      now,
    );
    expect(done.text).toBe(`Handed off. ${id} waits for the person to review Arreglar.`);
    const shown = showItem(ctx, id, { actor: you, channel: 'ui' }, now);
    expect(shown.board?.notes).toEqual([
      expect.objectContaining({ step: 'Arreglar', round: 1, note: 'abrí el faro y se enciende' }),
    ]);
  });

  it('is read from the reason of a handoff too, as a move reads it', () => {
    const ctx = memoryContext();
    const id = bugInFix(ctx);
    attach(ctx, id, 'ecode');
    const done = handoffItem(
      ctx,
      { id, actor: mender, channel: 'cli', reason: 'la prueba pasó' },
      now,
    );
    expect(done.text).toBe(`Handed off. ${id} waits for the person to review Arreglar.`);
    const shown = showItem(ctx, id, { actor: you, channel: 'ui' }, now);
    expect(shown.board?.notes).toEqual([
      expect.objectContaining({ step: 'Arreglar', round: 1, note: 'la prueba pasó' }),
    ]);
  });

  it('is read from the reason of a move along the workflow too', () => {
    const ctx = memoryContext();
    const id = bugInFix(ctx);
    attach(ctx, id, 'ecode');
    expect(
      refusal(() => moveItem(ctx, { id, to: 'sfix__review', actor: mender, channel: 'cli' }, now))
        .code,
    ).toBe('missing_fields');
    moveItem(
      ctx,
      { id, to: 'sfix__review', actor: mender, channel: 'cli', reason: 'la prueba pasó' },
      now,
    );
    expect(showItem(ctx, id, { actor: you, channel: 'ui' }, now).board?.notes[0]?.note).toBe(
      'la prueba pasó',
    );
  });
});

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
  updateItemState(ctx.db, parent.id, 'sexec', now());
  return { id: parent.id, part: part.id };
}

describe('waiting for parts', () => {
  it('refuses the handoff while a part is open (children_open), then lets it through', () => {
    const ctx = memoryContext();
    const { id, part } = change(ctx);
    const agent = { kind: 'agent' as const, name: 'kiln' };

    expect(refusal(() => handoffItem(ctx, { id, actor: agent, channel: 'cli' }, now))).toEqual({
      code: 'children_open',
      message: [
        `Not handed off ${id}: its part ${part} (Propuesta) is not finished.`,
        `Nothing moves ${id} for them: hand it off again once they are Done or Dropped.`,
      ].join('\n'),
    });
    updateItemState(ctx.db, part, 'done', now());
    expect(handoffItem(ctx, { id, actor: agent, channel: 'cli' }, now).text).toBe(
      `Handed off. ${id} waits for the person to review Ejecutar.`,
    );
  });

  it('refuses the approval of a part reopened during the review, the person’s too', () => {
    const ctx = memoryContext();
    const { id, part } = change(ctx);
    updateItemState(ctx.db, id, 'sexec__review', now());

    expect(refusal(() => approveItem(ctx, { id, actor: you, channel: 'ui' }, now))).toEqual({
      code: 'children_open',
      message: `Not approved ${id}: ${part} (Propuesta) was reopened and is not finished.`,
    });
    expect(
      refusal(() => moveItem(ctx, { id, to: 'done', actor: you, channel: 'ui' }, now)).code,
    ).toBe('children_open');
  });
});

describe('a drop', () => {
  it('asks a motive on a board that has them, then closes in that motive', () => {
    const ctx = memoryContext();
    const id = bugInFix(ctx);
    const drop = (input: Partial<Parameters<typeof dropItem>[1]>) =>
      dropItem(ctx, { id, actor: mender, channel: 'cli', ...input }, now);

    expect(refusal(() => drop({}))).toEqual({
      code: 'reason_required',
      message: `Not dropped ${id}: say why with --reason.`,
    });
    expect(refusal(() => drop({ reason: 'ya está' }))).toEqual({
      code: 'reason_required',
      message: `Not dropped ${id}: say which with --as "Rechazado|Duplicado".`,
    });
    expect(drop({ reason: 'ya está', motive: 'duplicado' }).text).toBe(
      `Dropped. ${id} is Dropped (Duplicado).`,
    );
    expect(getItem(ctx, id).state).toBe('dropped__duplicate');
  });

  it('is the person’s only, where the step does not let its doer drop', () => {
    const ctx = memoryContext();
    publishAs(ctx, errores(), 'berr', now);
    const bug = createItem(
      ctx,
      { collection: 'Errores', title: 'Faro', fields: {}, actor: you, channel: 'ui' },
      now,
    );
    expect(
      refusal(() =>
        dropItem(
          ctx,
          { id: bug.id, actor: mender, channel: 'cli', reason: 'x', motive: 'Rechazado' },
          now,
        ),
      ),
    ).toEqual({
      code: 'forbidden',
      message: `Not dropped ${bug.id}: only the person drops items here.`,
    });
    expect(
      refusal(() =>
        dropItem(
          ctx,
          {
            id: bug.id,
            actor: you,
            channel: 'cli',
            via: 'relay',
            reason: 'x',
            motive: 'Rechazado',
          },
          now,
        ),
      ),
    ).toEqual({
      code: 'not_relayable',
      message: "Not relayed: on Errores the person drops items from the item's page.",
    });
  });

  it('refuses the plain discard on a board with motives, from the page too', () => {
    const ctx = memoryContext();
    const id = bugInFix(ctx);
    expect(
      refusal(() =>
        moveItem(ctx, { id, to: 'dropped', actor: you, channel: 'ui', reason: 'x' }, now),
      ).code,
    ).toBe('reason_required');
    moveItem(ctx, { id, to: 'dropped__rejected', actor: you, channel: 'ui', reason: 'no' }, now);
    expect(getItem(ctx, id).state).toBe('dropped__rejected');
  });
});
