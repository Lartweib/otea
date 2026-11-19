import { beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../core/item.ts';
import { appendEvent } from '../store/queries.ts';
import type { Context } from './context.ts';
import { ITEM_HITS_AT_MOST, searchItems } from './item-search.ts';
import { memoryContext } from './testing.ts';

// P3C-R2-8: a decision made in an item's thread was invisible to a topic search, so the agent said
// it was only in the commit. A search looks in the items' threads too.

const fede: Actor = { kind: 'human', name: 'fede' };
const quill: Actor = { kind: 'agent', name: 'quill' };

let ctx: Context;
let clock: number;
const at = () => {
  clock += 1000;
  return new Date(clock).toISOString();
};

function seedItem(id: string, title: string, fields: Record<string, unknown> = {}): void {
  ctx.db.exec(
    `INSERT OR IGNORE INTO collections (name, prefix, next_seq) VALUES ('Cambios', 'CAM', 1)`,
  );
  const when = at();
  ctx.db
    .prepare(
      `INSERT INTO items (id, collection, seq, title, fields, state, created_at, updated_at,
        created_by_kind, created_by_name)
       VALUES (?, 'Cambios', ?, ?, ?, 'open', ?, ?, 'agent', 'quill')`,
    )
    .run(id, Number(id.split('-')[1]), title, JSON.stringify(fields), when, when);
}

function said(item: string, type: string, actor: Actor, data: Record<string, unknown>): void {
  appendEvent(ctx.db, { itemId: item, type, actor, at: at(), data });
}

beforeEach(() => {
  ctx = memoryContext();
  clock = Date.parse('2026-11-17T10:00:00.000Z');
});

describe('searching the items', () => {
  it("finds a word in an item's thread: notes, their answers, questions and handoff notes", () => {
    seedItem('CAM-1', 'Listado de pedidos');
    said('CAM-1', 'note_left', fede, { note: 1, text: '¿Paginamos con offset?' });
    said('CAM-1', 'note_answered', quill, { note: 1, text: 'Mejor con cursor: no salta filas.' });
    seedItem('CAM-2', 'Otra cosa');
    said('CAM-2', 'question_asked', quill, { question: 1, text: '¿Qué licencia usamos?' });
    said('CAM-2', 'question_answered', fede, { question: 1, text: 'MIT.' });
    seedItem('CAM-3', 'Y otra');
    said('CAM-3', 'transitioned', quill, { from: 'a', to: 'b', note: 'Cambié el logo a SVG.' });

    const hits = (search: string) => searchItems(ctx, search);
    expect(hits('cursor paginación')).toEqual([
      {
        id: 'CAM-1',
        title: 'Listado de pedidos',
        said: 'Mejor con cursor: no salta filas.',
        by: 'quill',
        at: expect.any(String),
      },
    ]);
    expect(hits('mit').map(({ id, said: text }) => `${id} ${text}`)).toEqual(['CAM-2 MIT.']);
    expect(hits('logo').map(({ id }) => id)).toEqual(['CAM-3']);
    expect(hits('kubernetes')).toEqual([]);
    expect(hits('  ')).toEqual([]);
  });

  it('finds an item by its title and fields too, and ranks the one with the most words first', () => {
    seedItem('CAM-1', 'Paginación del listado');
    seedItem('CAM-2', 'Exportar', { want: 'Paginación con cursor en el export' });

    expect(
      searchItems(ctx, 'paginación cursor').map(({ id, said: text }) => `${id} ${text}`),
    ).toEqual(['CAM-2 Paginación con cursor en el export', 'CAM-1 Paginación del listado']);
  });

  it(`gives ${ITEM_HITS_AT_MOST} items at most, and cuts a long text short`, () => {
    for (const n of [1, 2, 3, 4, 5, 6]) seedItem(`CAM-${n}`, `Cursor ${n}`);
    seedItem('CAM-7', 'Largo');
    said('CAM-7', 'note_left', fede, { note: 1, text: `cursor ${'palabra '.repeat(60)}` });

    const hits = searchItems(ctx, 'cursor');
    expect(hits).toHaveLength(ITEM_HITS_AT_MOST);
    expect(hits[0]).toMatchObject({ id: 'CAM-7' });
    expect(hits[0]?.said.length).toBeLessThanOrEqual(200);
    expect(hits[0]?.said.endsWith('…')).toBe(true);
  });
});
