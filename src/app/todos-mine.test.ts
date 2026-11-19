import { describe, expect, it } from 'vitest';
import { addBoard } from './boards.ts';
import { createItem, getItem, updateItem } from './items.ts';
import { handoffItem, liveBoardOf, nextFor } from './next.ts';
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
    expect(photos.state).toBe(step('Lo haces tú'));
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

  it('goes back to the person when the agent finds it is theirs, with a reason', () => {
    const { ctx, step, make } = todos();
    const call = make('Llamar al proveedor');
    expect(nextFor(ctx, 'kiln', { claim: true }, now).item).toBe(call.id);
    handoffItem(
      ctx,
      { id: call.id, actor: kiln, channel: 'cli', way: 'Lo haces tú', reason: 'una llamada' },
      now,
    );
    expect(getItem(ctx, call.id).state).toBe(step('Lo haces tú'));
    expect(nextFor(ctx, 'kiln', {}, now).item).toBeNull();
  });
});
