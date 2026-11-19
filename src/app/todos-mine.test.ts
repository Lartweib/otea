import { describe, expect, it } from 'vitest';
import { addBoard } from './boards.ts';
import { createItem, getItem, moveItem, requireItem, showItem, updateItem } from './items.ts';
import { boardBlockOf, handoffItem, liveBoardOf, nextFor } from './next.ts';
import { memoryContext } from './testing.ts';

const you = { kind: 'human' as const, name: 'fede' };
const kiln = { kind: 'agent' as const, name: 'kiln' };

let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 19, 9, 0, tick++)).toISOString();

// P4-R2-12: on Pendientes, a chore only the person can do («Lo hago yo») stays with them: no agent
// is offered it, and they close it themselves. One for an agent starts at Hacerlo, as before.
describe('a to-do the person does themselves', () => {
  function todos() {
    const ctx = memoryContext();
    addBoard(ctx, { name: 'Pendientes', template: 'todos', lang: 'es', by: you }, now);
    const def = liveBoardOf(ctx, 'Pendientes')?.def;
    if (!def) throw new Error('no board');
    const ref = (name: string) => Object.values(def.parts).find((p) => p.name === name)?.id ?? '';
    const step = (name: string) => def.steps.find((s) => s.name === name)?.id ?? '';
    const make = (title: string, fields: Record<string, string> = {}) =>
      createItem(
        ctx,
        {
          collection: 'Pendientes',
          title,
          fields: { [ref('Qué hace falta')]: title, ...fields },
          actor: you,
          channel: 'ui',
        },
        now,
      );
    return { ctx, ref, step, make };
  }

  it('starts with the person and is never offered to an agent', () => {
    const { ctx, ref, step, make } = todos();
    const photos = make('Sacar las fotos', { [ref('Lo hago yo')]: 'yes' });
    const letter = make('Escribir la carta');
    expect(photos.state).toBe(step('Tu parte'));
    expect(photos.turn).toBe('human');
    expect(letter.state).toBe(step('Hacerlo'));
    expect(nextFor(ctx, 'kiln', {}, now).item).toBe(letter.id);
  });

  it('closes from there once the person says what they did', () => {
    const { ctx, ref, make } = todos();
    const photos = make('Sacar las fotos', { [ref('Lo hago yo')]: 'yes' });
    const close = () =>
      handoffItem(ctx, { id: photos.id, actor: you, channel: 'ui', way: 'Done' }, now);
    expect(close).toThrow(expect.objectContaining({ code: 'missing_fields' }));
    const did = { [ref('Lo que hice')]: 'Fotos en la carpeta compartida' };
    updateItem(ctx, { id: photos.id, fields: did, actor: you }, now);
    close();
    expect(getItem(ctx, photos.id).turn).toBe('none');
  });

  // P4-R3-1: the person's own to-do leads to Hecho; passing it to Hacerlo looped through an agent
  // back to their own review.
  it('offers the person only Hecho, and never hands their own to-do to an agent', () => {
    const { ctx, ref, step, make } = todos();
    const photos = make('Sacar las fotos', { [ref('Lo hago yo')]: 'yes' });
    const desk = { actor: you, channel: 'ui' as const };
    const offered = () =>
      showItem(ctx, photos.id, desk, now)
        .transitions.map(({ to }) => to)
        .filter((to) => !to.startsWith('dropped'));
    expect(offered()).toEqual(['done']);
    const did = { [ref('Lo que hice')]: 'Fotos en la carpeta compartida' };
    updateItem(ctx, { id: photos.id, fields: did, actor: you }, now);
    const pass = () => moveItem(ctx, { id: photos.id, to: step('Hacerlo'), ...desk }, now);
    expect(pass).toThrow(expect.objectContaining({ code: 'invalid_transition' }));
    expect(getItem(ctx, photos.id).state).toBe(step('Tu parte'));
    // Once it is no longer theirs, it may go to an agent again.
    updateItem(ctx, { id: photos.id, fields: { [ref('Lo hago yo')]: 'no' }, actor: you }, now);
    expect(offered()).toEqual([step('Hacerlo'), 'done']);
  });

  it('goes back to the person when the agent finds it is theirs, with a reason', () => {
    const { ctx, step, make } = todos();
    const call = make('Llamar al proveedor');
    expect(nextFor(ctx, 'kiln', { claim: true }, now).item).toBe(call.id);
    handoffItem(
      ctx,
      { id: call.id, actor: kiln, channel: 'cli', way: 'Tu parte', reason: 'una llamada' },
      now,
    );
    expect(getItem(ctx, call.id).state).toBe(step('Tu parte'));
    expect(nextFor(ctx, 'kiln', {}, now).item).toBeNull();
  });

  // P4-R3-3: PEN-2, which she did herself after kiln took it back, said «Hecho; lo hizo kiln».
  it('names the person as the one who did it when they closed their own step', () => {
    const { ctx, ref, make } = todos();
    const call = make('Llamar al proveedor');
    nextFor(ctx, 'kiln', { claim: true }, now);
    const back = { id: call.id, actor: kiln, channel: 'cli' as const, way: 'Tu parte' };
    handoffItem(ctx, { ...back, reason: 'una llamada' }, now);
    updateItem(ctx, { id: call.id, fields: { [ref('Lo que hice')]: 'Llamé' }, actor: you }, now);
    handoffItem(ctx, { id: call.id, actor: you, channel: 'ui', way: 'Done' }, now);

    const closed = boardBlockOf(ctx, requireItem(ctx.db, call.id))?.closedBy;
    expect(closed?.doer).toBeUndefined();
    expect(closed?.doneByPerson).toBe(true);
  });
});
