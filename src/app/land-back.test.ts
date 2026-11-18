import { describe, expect, it } from 'vitest';
import { cambios, step, tareasDeRepo } from '../core/board/testing.ts';
import { updateItemState } from '../store/queries.ts';
import { createItem, getItem, moveItem } from './items.ts';
import { memoryContext, publishAs } from './testing.ts';

const you = { kind: 'human' as const, name: 'fede' };
const agent = { kind: 'agent' as const, name: 'quill' };
let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 18, 9, 0, tick++)).toISOString();

// An approved item an agent lands in Integrar (the land step): the person may still send it back
// to the step they approved, with a reason, before it lands (P1-4).
function landing() {
  const ctx = memoryContext();
  const def = tareasDeRepo();
  def.steps.push(step('sland', 'Integrar', { reviewer: 'none' }));
  publishAs(ctx, def, 'brt', now);
  publishAs(ctx, cambios(), 'bcam', now);
  const parent = createItem(
    ctx,
    { collection: 'Cambios', title: 'Nube', fields: { fwhat: 'x' }, actor: you },
    now,
  );
  const task = createItem(
    ctx,
    {
      collection: 'Tareas de repo',
      title: 'API',
      fields: { frepo: 'api', fbranch: 'feat/x' },
      parent: parent.id,
      actor: you,
    },
    now,
  );
  updateItemState(ctx.db, task.id, 'sland', now());
  return { ctx, id: task.id };
}

describe('sending an approved item back from its land step', () => {
  it('takes it back to the step the person approved, with a reason', () => {
    const { ctx, id } = landing();

    moveItem(ctx, { id, to: 'simpl', actor: you, channel: 'ui', reason: 'falta un caso' }, now);

    expect(getItem(ctx, id).state).toBe('simpl');
  });

  it('needs a reason', () => {
    const { ctx, id } = landing();

    expect(() => moveItem(ctx, { id, to: 'simpl', actor: you, channel: 'ui' }, now)).toThrow(
      /reason/i,
    );
  });

  it('is the person’s, never the landing agent’s', () => {
    const { ctx, id } = landing();

    expect(() =>
      moveItem(ctx, { id, to: 'simpl', actor: agent, channel: 'cli', reason: 'x' }, now),
    ).toThrow();
    expect(getItem(ctx, id).state).toBe('sland');
  });
});
