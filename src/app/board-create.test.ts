import { describe, expect, it } from 'vitest';
import { cambios, errores, tareasDeRepo } from '../core/board/testing.ts';
import { OteaError } from '../core/errors.ts';
import { createItem, getItem } from './items.ts';
import { createdTextOf } from './next.ts';
import { linkItems } from './relations.ts';
import { memoryContext, publishAs } from './testing.ts';

const you = { kind: 'human' as const, name: 'fede' };
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

describe('creating an item on a board', () => {
  it('starts at the step after one it already has everything for, and says so', () => {
    const ctx = memoryContext();
    publishAs(ctx, errores(), 'berr', now);
    const ready = createItem(
      ctx,
      { collection: 'Errores', title: 'Faro', fields: { fsteps: 'abrir' }, actor: you },
      now,
    );
    const lacking = createItem(ctx, { collection: 'Errores', title: 'Barca', actor: you }, now);

    expect(getItem(ctx, ready.id).state).toBe('striage');
    expect(createdTextOf(ctx, getItem(ctx, ready.id))).toBe(
      `Created ${ready.id} in Triar: it already had everything Completar asks for.`,
    );
    expect(getItem(ctx, lacking.id).state).toBe('sfill');
    expect(createdTextOf(ctx, getItem(ctx, lacking.id))).toBe(
      `Created ${lacking.id} in Completar: missing Pasos. Fill them, then otea handoff ${lacking.id}.`,
    );
  });

  it('needs a parent on a board whose items are always part of another’s', () => {
    const ctx = memoryContext();
    publishAs(ctx, tareasDeRepo(), 'brt', now);
    publishAs(ctx, cambios(), 'bcam', now);

    expect(
      refusal(() =>
        createItem(
          ctx,
          {
            collection: 'Tareas de repo',
            title: 'API',
            fields: { frepo: 'api', fbranch: 'feat/a' },
            actor: you,
          },
          now,
        ),
      ),
    ).toEqual({
      code: 'parent_required',
      message:
        "Not created: a Tarea de repo is always part of a Cambio. Create it with --parent <the Cambio's id>.",
    });
  });

  it('refuses a parent on another board than the one it divides into', () => {
    const ctx = memoryContext();
    publishAs(ctx, tareasDeRepo(), 'brt', now);
    publishAs(ctx, cambios(), 'bcam', now);
    publishAs(ctx, errores(), 'berr', now);
    const change = createItem(
      ctx,
      { collection: 'Cambios', title: 'Nube', fields: { fwhat: 'x' }, actor: you },
      now,
    );
    const bug = createItem(ctx, { collection: 'Errores', title: 'Faro', actor: you }, now);

    expect(
      refusal(() =>
        linkItems(
          ctx,
          { id: bug.id, kind: 'parent', other: change.id, actor: you, channel: 'cli' },
          now,
        ),
      ),
    ).toEqual({
      code: 'parent_type',
      message: `Not linked: the parts of a Cambio are Tareas de repo, and ${bug.id} is on Errores.`,
    });
    expect(
      linkItems(
        ctx,
        { id: bug.id, kind: 'blocks', other: change.id, actor: you, channel: 'cli' },
        now,
      ).kind,
    ).toBe('blocks');
  });
});
