import { describe, expect, it } from 'vitest';
import type { BoardDefinition } from '../core/board/model.ts';
import { createBoardSet } from './boards.ts';
import { memoryContext } from './testing.ts';

let tick = 0;
const now = () => new Date(Date.UTC(2026, 10, 17, 9, 0, tick++)).toISOString();

// Every text a board's steps and parts carry, joined: what its agents read.
function texts(def: BoardDefinition | undefined): string {
  if (!def) throw new Error('no board');
  return [
    def.about,
    def.idle,
    ...def.steps.flatMap(({ instructions }) => Object.values(instructions)),
    ...Object.values(def.parts).map(({ hint }) => hint),
  ].join('\n');
}

describe('a template set names its own boards in its texts', () => {
  it('a second Ideas set points at its own Implementación and at itself (IDEA3-2)', () => {
    const ctx = memoryContext();
    createBoardSet(ctx, { set: 'ideas', lang: 'es', boards: [] }, now);
    const [ideas, tasks] = createBoardSet(
      ctx,
      { set: 'ideas', lang: 'es', boards: [{ name: 'Producto' }] },
      now,
    );
    const def = ideas?.draft?.definition;
    expect(tasks?.draft?.definition.name).toBe('Implementación 2');
    expect(texts(def)).toContain('crea las tareas en el tablero Implementación 2:');
    expect(texts(def)).toContain('otea create --collection Producto --parent <id>');
    expect(texts(def)).toContain('las tareas creadas en Implementación 2,');
    expect(texts(def)).not.toMatch(/Implementación(?! 2)/);
    expect(texts(tasks?.draft?.definition)).toContain('en Planificar de Producto,');
  });

  it('quotes a board name with a space where a command takes it', () => {
    const ctx = memoryContext();
    createBoardSet(ctx, { set: 'repos', lang: 'en', boards: [] }, now);
    const [jobs] = createBoardSet(
      ctx,
      { set: 'repos', lang: 'en', boards: [{ name: 'Other jobs' }] },
      now,
    );
    const words = texts(jobs?.draft?.definition);
    expect(words).toContain('otea create --collection "Deliveries 2" --parent <this id>');
    expect(words).toContain('otea next --collection "Deliveries 2".');
  });

  it('keeps the template names in the first set', () => {
    const ctx = memoryContext();
    const [ideas] = createBoardSet(ctx, { set: 'ideas', lang: 'en', boards: [] }, now);
    const words = texts(ideas?.draft?.definition);
    expect(words).toContain('create the tasks on the Implementation board:');
    expect(words).toContain('otea create --collection Ideas --parent <id>');
  });
});
