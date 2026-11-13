import { describe, expect, it } from 'vitest';
import { listBoardSummaries } from './boards.ts';
import { initBoards } from './init-boards.ts';
import { memoryContext } from './testing.ts';

const names = (ctx: ReturnType<typeof memoryContext>) =>
  listBoardSummaries(ctx)
    .filter(({ builtin }) => !builtin)
    .map(({ name, status }) => `${name} ${status}`);

describe('initBoards', () => {
  it('starts a project with Tareas and Errores, published, once', () => {
    const ctx = memoryContext();

    expect(initBoards(ctx).map(({ name }) => name)).toEqual(['Tareas', 'Errores']);
    expect(initBoards(ctx)).toEqual([]);
    expect(names(ctx)).toEqual(['Tareas live', 'Errores live']);
  });

  it('makes every board of a template set, the part board joined to its parent', () => {
    const ctx = memoryContext();

    expect(initBoards(ctx, 'repos').map(({ name }) => name)).toEqual(['Cambios', 'Tareas de repo']);
    expect(names(ctx).sort()).toEqual(['Cambios live', 'Tareas de repo live']);
  });

  it('makes one board from a single template', () => {
    const ctx = memoryContext();

    expect(initBoards(ctx, 'decisions').map(({ name }) => name)).toEqual(['Arquitectura']);
  });

  it('makes none with none', () => {
    const ctx = memoryContext();

    expect(initBoards(ctx, 'none')).toEqual([]);
    expect(names(ctx)).toEqual([]);
  });

  it('makes no board from a template on a project that has boards of its own', () => {
    const ctx = memoryContext();
    initBoards(ctx);

    expect(initBoards(ctx, 'product')).toEqual([]);
    expect(initBoards(ctx, 'decisions')).toEqual([]);
    expect(names(ctx)).toEqual(['Tareas live', 'Errores live']);
  });

  it('refuses a template it does not know with not_found, boards or not', () => {
    const ctx = memoryContext();
    expect(() => initBoards(ctx, 'nope')).toThrow(expect.objectContaining({ code: 'not_found' }));
    initBoards(ctx);
    expect(() => initBoards(ctx, 'nope')).toThrow(expect.objectContaining({ code: 'not_found' }));
    expect(() => initBoards(ctx, 'repotasks')).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
  });
});
