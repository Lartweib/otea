import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from './i18n/i18n.ts';
import { createBlocked, startCollection } from './intake.ts';
import type { CollectionView } from './types.ts';

afterEach(() => setLanguage('en'));

const board = (name: string) => ({ name }) as CollectionView;
const pedidos = board('Pedidos');
const cambios = board('Cambios');
const entregas = board('Entregas');
const all = [pedidos, cambios, entregas];
const builtins = new Set(['Pedidos']);

// P2S-R2-8, P6-R2-8: «Nuevo ítem» opened on the first board (Pedidos, or Cambios on the Entregas
// page). It opens on the board asked for, else the one on screen, else the first of the person's
// own boards; Pedidos only when there is nothing else.
describe('the board a new item starts on', () => {
  it('is the board asked for, then the board on screen', () => {
    expect(startCollection(all, { asked: 'Cambios', onScreen: 'Entregas', builtins })).toBe(
      cambios,
    );
    expect(startCollection(all, { onScreen: 'Entregas', builtins })).toBe(entregas);
  });

  it('skips the built-in Pedidos for a board of the person’s own', () => {
    expect(startCollection(all, { builtins })).toBe(cambios);
    expect(startCollection([pedidos], { builtins })).toBe(pedidos);
    expect(startCollection([], { builtins })).toBeUndefined();
  });

  it('ignores a board on screen that takes no new items here', () => {
    expect(startCollection(all, { onScreen: 'Archivado', builtins })).toBe(cambios);
  });
});

// P6-R2-8: «Crear» was disabled with no reason beside it; the reason (nothing open to be part of)
// was only at the top of the form.
describe('why Crear waits', () => {
  it('says what is missing, the parent first', () => {
    setLanguage('es');
    expect(createBlocked({ missing: [], parent: undefined })).toBeUndefined();
    expect(createBlocked({ missing: ['Título', 'Qué hace falta'], parent: undefined })).toBe(
      'Falta Título, Qué hace falta para crear.',
    );
    expect(
      createBlocked({
        missing: ['Título'],
        parent: { item: 'Trabajo', board: 'Trabajos', open: 0 },
      }),
    ).toBe('Todavía no hay nada abierto en Trabajos de lo que pueda ser parte.');
    expect(
      createBlocked({ missing: [], parent: { item: 'Trabajo', board: 'Trabajos', open: 2 } }),
    ).toBe('Elige de qué Trabajo es parte.');
  });
});
