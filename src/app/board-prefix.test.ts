import { describe, expect, it } from 'vitest';
import { findCollection } from '../store/queries.ts';
import { addBoard, prefixOf } from './boards.ts';
import { memoryContext } from './testing.ts';

// A new board's item ids start with the first letters of what each item is called, skipping a
// handful of words nobody wants on every id.
describe('prefixOf', () => {
  it('takes the first three letters of the item, accents aside', () => {
    expect(prefixOf(memoryContext(), 'Tarea', 'Tareas')).toBe('TAR');
    expect(prefixOf(memoryContext(), 'Ítem', 'Cosas')).toBe('ITE');
  });

  it('skips an awkward prefix for the next letters of the same word', () => {
    expect(prefixOf(memoryContext(), 'Asset', 'Assets')).toBe('ASE');
    expect(prefixOf(memoryContext(), 'Sexto', 'Sextos')).toBe('SET');
    expect(prefixOf(memoryContext(), 'Putter', 'Putters')).toBe('PUE');
  });

  it('adds the initials of the board name’s other words when the prefix is taken', () => {
    const ctx = memoryContext();
    const you = { kind: 'human' as const, name: 'fede' };
    addBoard(ctx, { name: 'Cambios', item: 'Cambio', lang: 'es', by: you });

    expect(prefixOf(ctx, 'Cambio', 'Cambios web')).toBe('CAMW');
    expect(prefixOf(ctx, 'Cambio', 'Cambios de la app web')).toBe('CAMAW');
    // No other word to tell it apart: one letter more of what each item is called (ONB-25).
    expect(prefixOf(ctx, 'Cambio', 'Camb')).toBe('CAMB');
  });

  it('takes the prefix the person chose, refusing one taken or not made of letters', () => {
    const ctx = memoryContext();
    const you = { kind: 'human' as const, name: 'fede' };
    const web = addBoard(ctx, {
      name: 'Cambios web',
      item: 'Cambio',
      lang: 'es',
      prefix: 'web',
      by: you,
    });
    expect(findCollection(ctx.db, web.record.collection ?? '')?.prefix).toBe('WEB');
    expect(() =>
      addBoard(ctx, { name: 'Otros', item: 'Cambio', lang: 'es', prefix: 'WEB', by: you }),
    ).toThrow(expect.objectContaining({ code: 'already_exists' }));
    expect(() =>
      addBoard(ctx, { name: 'Más', item: 'Cambio', lang: 'es', prefix: 'c-1', by: you }),
    ).toThrow(expect.objectContaining({ code: 'invalid_name' }));
    expect(findCollection(ctx.db, 'Otros')).toBeUndefined();
  });

  it('still gives a prefix when every pick of letters is awkward', () => {
    expect(prefixOf(memoryContext(), 'Ass', 'Ass')).toBe('ASS');
  });
});
