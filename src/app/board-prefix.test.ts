import { describe, expect, it } from 'vitest';
import { prefixOf } from './boards.ts';
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

  it('still gives a prefix when every pick of letters is awkward', () => {
    expect(prefixOf(memoryContext(), 'Ass', 'Ass')).toBe('ASS');
  });
});
