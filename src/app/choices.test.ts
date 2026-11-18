import { describe, expect, it } from 'vitest';
import { OPTION_CHOSEN } from '../core/board/choices.ts';
import type { Actor } from '../core/item.ts';
import { selectEvents } from '../store/queries.ts';
import { initBoards } from './init-boards.ts';
import { createItem, moveItem, requireItem, updateItem } from './items.ts';
import { claimItem } from './leases.ts';
import { boardBlockOf, handoffItem, itemNextText, liveBoardOf } from './next.ts';
import { memoryContext } from './testing.ts';

// Reviewing a Decisión, the person picks one of its options, with a comment if they like: the
// choice is kept as an event, goes with the approval, and the agent reads it in next and show.

const you: Actor = { kind: 'human', name: 'fede' };
const quill: Actor = { kind: 'agent', name: 'quill' };
let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 18, 9, 0, tick++)).toISOString();

const OPTIONS = [
  '### A · SQLite local (recomendada)',
  'Todo queda en el dispositivo.',
  '',
  '### B · Backend en la nube',
  'Un servidor guarda los datos.',
].join('\n');

function refinedDecision() {
  const ctx = memoryContext();
  initBoards(ctx, 'ideas');
  const { id } = createItem(
    ctx,
    {
      collection: 'Ideas',
      title: '¿SQLite local o backend en la nube?',
      fields: { 'La idea': 'Dónde viven los datos', 'Qué es': 'Decisión' },
      actor: you,
    },
    now,
  );
  claimItem(ctx, { id, actor: quill }, now);
  updateItem(ctx, { id, fields: { Opciones: OPTIONS }, actor: quill }, now);
  handoffItem(ctx, { id, actor: quill, channel: 'cli', note: 'Dos opciones' }, now);
  const step = (name: string) => {
    const found = liveBoardOf(ctx, 'Ideas')?.def.steps.find((each) => each.name === name);
    if (!found) throw new Error(`no step ${name}`);
    return found.id;
  };
  return { ctx, id, refine: step('Refinar'), design: step('Diseñar') };
}

const choiceError = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return (error as { code?: string; details?: { why?: string } }) ?? null;
  }
  return null;
};

describe('picking an option of a Decisión', () => {
  it('keeps the choice and its comment, and tells the agent at the next step', () => {
    const { ctx, id, refine, design } = refinedDecision();
    expect(requireItem(ctx.db, id).state).toBe(`${refine}__review`);
    moveItem(
      ctx,
      {
        id,
        to: design,
        actor: you,
        channel: 'ui',
        choice: { option: 'b', comment: 'necesitamos sincronizar' },
      },
      now,
    );
    expect(requireItem(ctx.db, id).state).toBe(design);
    const chosen = selectEvents(ctx.db, id).filter(({ type }) => type === OPTION_CHOSEN);
    expect(chosen).toHaveLength(1);
    expect(chosen[0]?.data).toMatchObject({
      option: 'B',
      name: 'Backend en la nube',
      comment: 'necesitamos sincronizar',
      step: refine,
      stepName: 'Refinar',
    });
    expect(boardBlockOf(ctx, requireItem(ctx.db, id))?.chosen).toMatchObject({
      option: 'B',
      name: 'Backend en la nube',
      comment: 'necesitamos sincronizar',
    });
    const text = itemNextText(ctx, requireItem(ctx.db, id), 'quill') ?? '';
    expect(text).toContain('The person chose\n  B · Backend en la nube (in Refinar)');
    expect(text).toContain('Their comment: "necesitamos sincronizar"');
  });

  it('says the choice once the Decisión is closed', () => {
    const { ctx, id, design } = refinedDecision();
    moveItem(ctx, { id, to: design, actor: you, channel: 'ui', choice: { option: 'A' } }, now);
    claimItem(ctx, { id, actor: quill }, now);
    updateItem(ctx, { id, fields: { Decisión: 'ADR: SQLite local' }, actor: quill }, now);
    handoffItem(ctx, { id, actor: quill, channel: 'cli', note: 'ADR escrito' }, now);
    moveItem(ctx, { id, to: 'done', actor: you, channel: 'ui', choice: { option: 'A' } }, now);
    expect(requireItem(ctx.db, id).state).toBe('done');
    // The same pick again records nothing new.
    expect(selectEvents(ctx.db, id).filter(({ type }) => type === OPTION_CHOSEN)).toHaveLength(1);
    expect(itemNextText(ctx, requireItem(ctx.db, id), 'quill')).toContain(
      'The person chose A · SQLite local.',
    );
  });

  it('refuses a letter the options do not have, an agent picking, and a send-back', () => {
    const { ctx, id, refine, design } = refinedDecision();
    const pick = (input: Partial<Parameters<typeof moveItem>[1]>) => () =>
      moveItem(ctx, { id, to: design, actor: you, channel: 'ui', ...input }, now);
    expect(choiceError(pick({ choice: { option: 'C' } }))).toMatchObject({
      code: 'invalid_transition',
      details: { why: 'unknown_option' },
    });
    expect(choiceError(pick({ actor: quill, choice: { option: 'A' } }))).not.toBeNull();
    expect(
      choiceError(pick({ to: refine, reason: 'más opciones', choice: { option: 'A' } })),
    ).toMatchObject({ details: { why: 'not_forward' } });
    expect(requireItem(ctx.db, id).state).toBe(`${refine}__review`);
    expect(selectEvents(ctx.db, id).some(({ type }) => type === OPTION_CHOSEN)).toBe(false);
  });
});
