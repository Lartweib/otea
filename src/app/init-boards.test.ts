import { describe, expect, it } from 'vitest';
import { listBoardSummaries } from './boards.ts';
import { initBoards } from './init-boards.ts';
import { memoryContext } from './testing.ts';

const names = (ctx: ReturnType<typeof memoryContext>) =>
  listBoardSummaries(ctx)
    .filter(({ builtin }) => !builtin)
    .map(({ name, status }) => `${name} ${status}`);

describe('initBoards', () => {
  it('starts a project with no board: the person picks the boards it uses', () => {
    const ctx = memoryContext();

    expect(initBoards(ctx)).toEqual([]);
    expect(names(ctx)).toEqual([]);
  });

  it('makes every board of a template set, the part board joined to its parent', () => {
    const ctx = memoryContext();

    expect(initBoards(ctx, 'repos').map(({ name }) => name)).toEqual(['Trabajos', 'Entregas']);
    expect(names(ctx).sort()).toEqual(['Entregas live', 'Trabajos live']);
  });

  it('makes one board from a single template', () => {
    const ctx = memoryContext();

    expect(initBoards(ctx, 'decisions').map(({ name }) => name)).toEqual(['Decisiones']);
  });

  it('makes none with none', () => {
    const ctx = memoryContext();

    expect(initBoards(ctx, 'none')).toEqual([]);
    expect(names(ctx)).toEqual([]);
  });

  it('makes no board from a template on a project that has boards of its own', () => {
    const ctx = memoryContext();
    initBoards(ctx, 'changes');

    expect(initBoards(ctx, 'repos')).toEqual([]);
    expect(initBoards(ctx, 'decisions')).toEqual([]);
    expect(names(ctx)).toEqual(['Encargos live']);
  });

  it('refuses a retired template: the catalogue replaced it', () => {
    const ctx = memoryContext();
    expect(() => initBoards(ctx, 'tasks')).toThrow(expect.objectContaining({ code: 'not_found' }));
  });

  it('refuses a template it does not know with not_found, boards or not', () => {
    const ctx = memoryContext();
    expect(() => initBoards(ctx, 'nope')).toThrow(expect.objectContaining({ code: 'not_found' }));
    initBoards(ctx, 'changes');
    expect(() => initBoards(ctx, 'nope')).toThrow(expect.objectContaining({ code: 'not_found' }));
    expect(() => initBoards(ctx, 'deliveries')).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
  });
});
